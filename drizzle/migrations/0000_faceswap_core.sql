CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  is_vip boolean NOT NULL DEFAULT false,
  vip_expires_at timestamptz,
  consent_accepted_at timestamptz,
  active_avatar_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Prevent users from granting themselves VIP
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'authenticated' OR auth.role() = 'authenticated' THEN
    NEW.is_vip := OLD.is_vip;
    NEW.vip_expires_at := OLD.vip_expires_at;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_protect BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

CREATE TABLE public.avatars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Avatar',
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.avatars TO authenticated;
GRANT ALL ON public.avatars TO service_role;
ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own avatars read" ON public.avatars FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own avatars delete" ON public.avatars FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.point_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.point_wallets TO authenticated;
GRANT ALL ON public.point_wallets TO service_role;
ALTER TABLE public.point_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own wallet" ON public.point_wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_id uuid REFERENCES public.avatars(id) ON DELETE SET NULL,
  resolution text NOT NULL DEFAULT '720p',
  started_at timestamptz NOT NULL DEFAULT now(),
  last_billed_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  seconds_billed integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active'
);
GRANT SELECT ON public.live_sessions TO authenticated;
GRANT ALL ON public.live_sessions TO service_role;
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions" ON public.live_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  type text NOT NULL,
  session_id uuid REFERENCES public.live_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.point_transactions TO authenticated;
GRANT ALL ON public.point_transactions TO service_role;
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tx" ON public.point_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Signup: profile + wallet with 120 welcome points
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));
  INSERT INTO public.point_wallets (user_id, balance) VALUES (NEW.id, 120);
  INSERT INTO public.point_transactions (user_id, delta, type) VALUES (NEW.id, 120, 'bonus');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Start session (server-authoritative)
CREATE OR REPLACE FUNCTION public.start_live_session(_avatar_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); bal int; sid uuid; vip boolean; consent timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT balance INTO bal FROM point_wallets WHERE user_id = uid;
  IF COALESCE(bal,0) <= 0 THEN RAISE EXCEPTION 'insufficient_points'; END IF;
  SELECT consent_accepted_at, is_vip INTO consent, vip FROM profiles WHERE user_id = uid;
  IF consent IS NULL THEN RAISE EXCEPTION 'consent_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM avatars WHERE id = _avatar_id AND user_id = uid) THEN RAISE EXCEPTION 'avatar_not_found'; END IF;
  UPDATE live_sessions SET status='ended', ended_at=now() WHERE user_id = uid AND status='active';
  INSERT INTO live_sessions (user_id, avatar_id, resolution) VALUES (uid, _avatar_id, CASE WHEN vip THEN '1080p' ELSE '720p' END) RETURNING id INTO sid;
  RETURN sid;
END $$;

-- Heartbeat billing: 1 point per elapsed second, capped at 15s between beats
CREATE OR REPLACE FUNCTION public.bill_live_session(_session_id uuid, _end boolean DEFAULT false)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); s live_sessions%ROWTYPE; secs int; bal int; charge int;
BEGIN
  SELECT * INTO s FROM live_sessions WHERE id = _session_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found'; END IF;
  IF s.status <> 'active' THEN
    SELECT balance INTO bal FROM point_wallets WHERE user_id = uid;
    RETURN json_build_object('active', false, 'balance', bal);
  END IF;
  secs := LEAST(GREATEST(floor(extract(epoch FROM now() - s.last_billed_at))::int, 0), 15);
  SELECT balance INTO bal FROM point_wallets WHERE user_id = uid FOR UPDATE;
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
  RETURN json_build_object('active', NOT (_end OR bal <= 0), 'balance', bal, 'charged', charge);
END $$;

REVOKE EXECUTE ON FUNCTION public.start_live_session(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.bill_live_session(uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.start_live_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bill_live_session(uuid, boolean) TO authenticated;