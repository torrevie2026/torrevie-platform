CREATE OR REPLACE FUNCTION public.admin_update_profile(
  _profile_id uuid,
  _role text,
  _is_ceo boolean,
  _manager_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_super boolean := COALESCE(public.is_super_admin(_caller), false);
  _caller_role text;
  _caller_company uuid;
  _target_company uuid;
  _old_role text;
  _old_is_ceo boolean;
  _old_manager uuid;
  _final_manager uuid;
  _cursor uuid;
  _safety int := 0;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _role NOT IN ('admin','finance','manager','employee') THEN
    RAISE EXCEPTION 'Invalid role: %', _role;
  END IF;

  SELECT company_id, role, is_ceo, manager_id
    INTO _target_company, _old_role, _old_is_ceo, _old_manager
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

  -- Cycle + same-company check for manager
  IF _final_manager IS NOT NULL THEN
    IF _final_manager = _profile_id THEN
      RAISE EXCEPTION 'A person cannot be their own manager';
    END IF;
    PERFORM 1 FROM public.profiles
      WHERE id = _final_manager AND company_id = _target_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Manager must be a profile in the same company';
    END IF;
    _cursor := _final_manager;
    WHILE _cursor IS NOT NULL AND _safety < 100 LOOP
      IF _cursor = _profile_id THEN
        RAISE EXCEPTION 'Reassignment would create a cycle';
      END IF;
      SELECT manager_id INTO _cursor FROM public.profiles WHERE id = _cursor;
      _safety := _safety + 1;
    END LOOP;
  END IF;

  UPDATE public.profiles
     SET role = _role,
         is_ceo = _is_ceo,
         manager_id = _final_manager
   WHERE id = _profile_id;

  INSERT INTO public.audit_log (company_id, user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    _target_company, _caller, 'update', 'profiles', _profile_id,
    jsonb_build_object('role', _old_role, 'is_ceo', _old_is_ceo, 'manager_id', _old_manager),
    jsonb_build_object('role', _role, 'is_ceo', _is_ceo, 'manager_id', _final_manager)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, boolean, uuid) TO authenticated;