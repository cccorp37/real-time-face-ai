import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const walletQuery = queryOptions({
  queryKey: ["wallet"],
  queryFn: async () => {
    const { data } = await supabase.from("point_wallets").select("balance").maybeSingle();
    return data?.balance ?? 0;
  },
});

export const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    const { data } = await supabase.from("profiles").select("*").maybeSingle();
    return data;
  },
});

export const adminQuery = queryOptions({
  queryKey: ["is-admin"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return false;
    const { data } = await supabase.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    return !!data;
  },
});

export const transactionsQuery = queryOptions({
  queryKey: ["transactions"],
  queryFn: async () => {
    const { data } = await supabase
      .from("point_transactions")
      .select("id, delta, type, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  },
});

export const sessionsQuery = queryOptions({
  queryKey: ["sessions"],
  queryFn: async () => {
    const { data } = await supabase
      .from("live_sessions")
      .select("id, started_at, ended_at, seconds_billed, resolution, status")
      .order("started_at", { ascending: false })
      .limit(20);
    return data ?? [];
  },
});
