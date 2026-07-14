CREATE OR REPLACE FUNCTION public.reassign_manager(
  _person_id uuid,
  _person_type text,
  _new_manager_id uuid
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
  _old_manager uuid;
  _cursor uuid;
  _safety int := 0;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _person_type NOT IN ('profile','employee') THEN
    RAISE EXCEPTION 'Invalid person_type: %', _person_type;
  END IF;

  IF _person_id = _new_manager_id THEN
    RAISE EXCEPTION 'A person cannot be their own manager';
  END IF;

  -- Resolve target company + current manager
  IF _person_type = 'profile' THEN
    SELECT company_id, manager_id INTO _target_company, _old_manager
      FROM public.profiles WHERE id = _person_id;
  ELSE
    SELECT company_id, manager_profile_id INTO _target_company, _old_manager
      FROM public.employees WHERE id = _person_id;
  END IF;

  IF _target_company IS NULL THEN
    RAISE EXCEPTION 'Person not found';
  END IF;

  -- Authorize: super_admin OR admin in same company
  IF NOT _is_super THEN
    _caller_role := public.get_user_role(_caller);
    _caller_company := public.get_user_company_id(_caller);
    IF _caller_role <> 'admin' OR _caller_company <> _target_company THEN
      RAISE EXCEPTION 'Not authorized to reassign this person';
    END IF;
  END IF;

  -- Validate new manager (must be a profile in the same company), and prevent cycles
  IF _new_manager_id IS NOT NULL THEN
    PERFORM 1 FROM public.profiles
      WHERE id = _new_manager_id AND company_id = _target_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'New manager must be a profile in the same company';
    END IF;

    -- Cycle check only relevant when reassigning a profile (employees can't be managers)
    IF _person_type = 'profile' THEN
      _cursor := _new_manager_id;
      WHILE _cursor IS NOT NULL AND _safety < 100 LOOP
        IF _cursor = _person_id THEN
          RAISE EXCEPTION 'Reassignment would create a cycle';
        END IF;
        SELECT manager_id INTO _cursor FROM public.profiles WHERE id = _cursor;
        _safety := _safety + 1;
      END LOOP;
    END IF;
  END IF;

  -- Apply update
  IF _person_type = 'profile' THEN
    UPDATE public.profiles SET manager_id = _new_manager_id WHERE id = _person_id;
  ELSE
    UPDATE public.employees SET manager_profile_id = _new_manager_id WHERE id = _person_id;
  END IF;

  -- Audit
  INSERT INTO public.audit_log (company_id, user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    _target_company, _caller, 'reassign_manager',
    CASE WHEN _person_type = 'profile' THEN 'profiles' ELSE 'employees' END,
    _person_id,
    jsonb_build_object('manager_id', _old_manager),
    jsonb_build_object('manager_id', _new_manager_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_manager(uuid, text, uuid) TO authenticated;