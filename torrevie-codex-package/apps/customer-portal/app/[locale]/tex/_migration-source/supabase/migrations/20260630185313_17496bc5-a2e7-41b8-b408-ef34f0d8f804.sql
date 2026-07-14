
-- Allow 'coordinator' role in admin_update_profile
CREATE OR REPLACE FUNCTION public.admin_update_profile(_profile_id uuid, _role text, _is_ceo boolean, _manager_id uuid, _full_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_super boolean := COALESCE(public.is_super_admin(_caller), false);
  _caller_role text;
  _caller_company uuid;
  _target_company uuid;
  _old_role text;
  _old_is_ceo boolean;
  _old_manager uuid;
  _old_name text;
  _final_manager uuid;
  _final_name text;
  _cursor uuid;
  _safety int := 0;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _role NOT IN ('admin','finance','manager','employee','coordinator') THEN
    RAISE EXCEPTION 'Invalid role: %', _role;
  END IF;

  SELECT company_id, role, is_ceo, manager_id, full_name
    INTO _target_company, _old_role, _old_is_ceo, _old_manager, _old_name
    FROM public.profiles WHERE id = _profile_id;
  IF _target_company IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;

  IF NOT _is_super THEN
    _caller_role := public.get_user_role(_caller);
    _caller_company := public.get_user_company_id(_caller);
    IF _caller_role <> 'admin' OR _caller_company <> _target_company THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  END IF;

  _final_manager := CASE WHEN _is_ceo THEN NULL ELSE _manager_id END;
  _final_name := COALESCE(NULLIF(btrim(_full_name), ''), _old_name);
  IF length(_final_name) > 120 THEN
    RAISE EXCEPTION 'Name too long';
  END IF;

  IF _final_manager IS NOT NULL THEN
    IF _final_manager = _profile_id THEN
      RAISE EXCEPTION 'A person cannot be their own manager';
    END IF;
    PERFORM 1 FROM public.profiles WHERE id = _final_manager AND company_id = _target_company;
    IF NOT FOUND THEN RAISE EXCEPTION 'Manager must be a profile in the same company'; END IF;
    _cursor := _final_manager;
    WHILE _cursor IS NOT NULL AND _safety < 100 LOOP
      IF _cursor = _profile_id THEN RAISE EXCEPTION 'Reassignment would create a cycle'; END IF;
      SELECT manager_id INTO _cursor FROM public.profiles WHERE id = _cursor;
      _safety := _safety + 1;
    END LOOP;
  END IF;

  UPDATE public.profiles
     SET role = _role,
         is_ceo = _is_ceo,
         manager_id = _final_manager,
         full_name = _final_name
   WHERE id = _profile_id;

  INSERT INTO public.audit_log (company_id, user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    _target_company, _caller, 'update', 'profiles', _profile_id,
    jsonb_build_object('role', _old_role, 'is_ceo', _old_is_ceo, 'manager_id', _old_manager, 'full_name', _old_name),
    jsonb_build_object('role', _role, 'is_ceo', _is_ceo, 'manager_id', _final_manager, 'full_name', _final_name)
  );
END;
$function$;

-- Trips: allow coordinators alongside admins
DROP POLICY IF EXISTS trips_insert ON public.trips;
DROP POLICY IF EXISTS trips_update ON public.trips;
DROP POLICY IF EXISTS trips_delete ON public.trips;

CREATE POLICY trips_insert ON public.trips FOR INSERT TO authenticated
  WITH CHECK (
    ((get_user_role(auth.uid()) IN ('admin','coordinator')) AND company_id = get_user_company_id(auth.uid()))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY trips_update ON public.trips FOR UPDATE TO authenticated
  USING (
    ((get_user_role(auth.uid()) IN ('admin','coordinator')) AND company_id = get_user_company_id(auth.uid()))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    ((get_user_role(auth.uid()) IN ('admin','coordinator')) AND company_id = get_user_company_id(auth.uid()))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY trips_delete ON public.trips FOR DELETE TO authenticated
  USING (
    ((get_user_role(auth.uid()) IN ('admin','coordinator')) AND company_id = get_user_company_id(auth.uid()))
    OR is_super_admin(auth.uid())
  );

-- Trip legs: add coordinator
DROP POLICY IF EXISTS "admins manage legs" ON public.trip_legs;
CREATE POLICY "admins manage legs" ON public.trip_legs FOR ALL TO authenticated
  USING (
    ((get_user_role(auth.uid()) = ANY (ARRAY['admin','manager','finance','coordinator'])) AND company_id = get_user_company_id(auth.uid()))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    ((get_user_role(auth.uid()) = ANY (ARRAY['admin','manager','finance','coordinator'])) AND company_id = get_user_company_id(auth.uid()))
    OR is_super_admin(auth.uid())
  );
