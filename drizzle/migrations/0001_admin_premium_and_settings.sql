CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.grant_admin_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(NEW.email) = 'avydigitalbusiness@gmail.com' THEN
    INSERT INTO user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
    UPDATE profiles SET is_vip = true, vip_expires_at = NULL WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_admin ON auth.users;
CREATE TRIGGER on_auth_user_admin AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.grant_admin_email();

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE lower(email) = 'avydigitalbusiness@gmail.com'
ON CONFLICT DO NOTHING;
UPDATE public.profiles SET is_vip = true, vip_expires_at = NULL
WHERE user_id IN (SELECT id FROM auth.users WHERE lower(email) = 'avydigitalbusiness@gmail.com');

CREATE OR REPLACE FUNCTION public.start_live_session(_avatar_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); bal int; sid uuid; vip boolean; consent timestamptz; adm boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  adm := has_role(uid, 'admin');
  SELECT balance INTO bal FROM point_wallets WHERE user_id = uid;
  IF NOT adm AND COALESCE(bal,0) <= 0 THEN RAISE EXCEPTION 'insufficient_points'; END IF;
  SELECT consent_accepted_at, is_vip INTO consent, vip FROM profiles WHERE user_id = uid;
  IF consent IS NULL THEN RAISE EXCEPTION 'consent_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM avatars WHERE id = _avatar_id AND user_id = uid) THEN RAISE EXCEPTION 'avatar_not_found'; END IF;
  UPDATE live_sessions SET status='ended', ended_at=now() WHERE user_id = uid AND status='active';
  INSERT INTO live_sessions (user_id, avatar_id, resolution) VALUES (uid, _avatar_id, CASE WHEN vip OR adm THEN '1080p' ELSE '720p' END) RETURNING id INTO sid;
  RETURN sid;
END $function$;

CREATE OR REPLACE FUNCTION public.bill_live_session(_session_id uuid, _end boolean DEFAULT false)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); s live_sessions%ROWTYPE; secs int; bal int; charge int; adm boolean;
BEGIN
  SELECT * INTO s FROM live_sessions WHERE id = _session_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  adm := has_role(uid, 'admin');
  IF s.status <> 'active' THEN
    SELECT balance INTO bal FROM point_wallets WHERE user_id = uid;
    RETURN json_build_object('active', false, 'balance', bal, 'unlimited', adm);
  END IF;
  secs := LEAST(GREATEST(floor(extract(epoch FROM now() - s.last_billed_at))::int, 0), 15);
  SELECT balance INTO bal FROM point_wallets WHERE user_id = uid FOR UPDATE;
  IF adm THEN
    UPDATE live_sessions SET last_billed_at = now(), seconds_billed = seconds_billed + secs,
      status = CASE WHEN _end THEN 'ended' ELSE 'active' END,
      ended_at = CASE WHEN _end THEN now() ELSE NULL END
    WHERE id = s.id;
    RETURN json_build_object('active', NOT _end, 'balance', bal, 'charged', 0, 'unlimited', true);
  END IF;
  charge := LEAST(secs, bal);
  IF charge > 0 THEN
    UPDATE point_wallets SET balance = balance - charge, updated_at = now() WHERE user_id = uid;
    INSERT INTO point_transactions (user_id, delta, type, session_id) VALUES (uid, -charge, 'live', s.id);
    bal := bal - charge;
  END IF;
  UPDATE live_sessions SET last_billed_at = now(), seconds_billed = seconds_billed + charge,
    status = CASE WHEN _end OR bal <= 0 THEN 'ended' ELSE 'active' END,
    ended_at = CASE WHEN _end OR bal <= 0 THEN now() ELSE NULL END
  WHERE id = s.id;
  RETURN json_build_object('active', NOT (_end OR bal <= 0), 'balance', bal, 'charged', charge, 'unlimited', false);
END $function$;