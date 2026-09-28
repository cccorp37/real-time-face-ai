import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_BYTES = 6 * 1024 * 1024;

export const listAvatars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("avatars")
      .select("id, name, storage_path, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!data?.length) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await supabaseAdmin.storage
      .from("avatars")
      .createSignedUrls(data.map((a) => a.storage_path), 3600);
    return data.map((a, i) => ({
      id: a.id,
      name: a.name,
      created_at: a.created_at,
      url: signed?.[i]?.signedUrl ?? null,
    }));
  });

export const uploadAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().trim().min(1).max(60),
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        base64: z.string().min(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("consent_accepted_at")
      .eq("user_id", context.userId)
      .single();
    if (!profile?.consent_accepted_at) throw new Error("Vous devez accepter le consentement biométrique.");
    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.byteLength > MAX_BYTES) throw new Error("Image trop lourde (6 Mo max).");
    const ext = data.contentType.split("/")[1];
    const path = `${context.userId}/${crypto.randomUUID()}.${ext}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const up = await supabaseAdmin.storage
      .from("avatars")
      .upload(path, bytes, { contentType: data.contentType });
    if (up.error) throw new Error("Échec de l'envoi de l'image.");
    const { data: row, error } = await supabaseAdmin
      .from("avatars")
      .insert({ user_id: context.userId, name: data.name, storage_path: path })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("profiles").update({ active_avatar_id: row.id }).eq("user_id", context.userId);
    return { id: row.id };
  });

export const deleteAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("avatars")
      .select("storage_path")
      .eq("id", data.id)
      .single();
    if (!row) throw new Error("Avatar introuvable");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from("avatars").remove([row.storage_path]);
    await context.supabase.from("avatars").delete().eq("id", data.id);
    return { ok: true };
  });

const ERRORS: Record<string, string> = {
  insufficient_points: "Solde de points insuffisant.",
  consent_required: "Acceptez le consentement biométrique dans les paramètres.",
  avatar_not_found: "Avatar introuvable.",
};

export const startLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ avatarId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: sa } = await import("@/integrations/supabase/client.server");
    const { data: setting } = await sa.from("app_settings").select("value").eq("key", "decart_api_key").maybeSingle();
    const apiKey = setting?.value ?? process.env["DECART_API_KEY"];
    if (!apiKey) throw new Error("Service de transformation non configuré.");
    const { data: sessionId, error } = await context.supabase.rpc("start_live_session", {
      _avatar_id: data.avatarId,
    });
    if (error) {
      const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
      throw new Error(key ? ERRORS[key] : "Impossible de démarrer la session.");
    }
    const { data: avatar } = await context.supabase
      .from("avatars")
      .select("storage_path")
      .eq("id", data.avatarId)
      .single();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await supabaseAdmin.storage
      .from("avatars")
      .createSignedUrl(avatar!.storage_path, 600);

    try {
      const res = await fetch("https://api.decart.ai/v1/client/tokens", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 600 }),
      });
      if (!res.ok) {
        console.error("Decart token error", res.status, await res.text());
        throw new Error("token");
      }
      const json = (await res.json()) as { apiKey?: string; api_key?: string };
      const clientKey = json.apiKey ?? json.api_key;
      if (!clientKey) throw new Error("token");
      return { sessionId: sessionId as string, clientKey, avatarUrl: signed?.signedUrl ?? null };
    } catch {
      await context.supabase.rpc("bill_live_session", { _session_id: sessionId as string, _end: true });
      throw new Error("Le service Decart AI est indisponible. Réessayez.");
    }
  });

export const heartbeatLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sessionId: z.string().uuid(), end: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("bill_live_session", {
      _session_id: data.sessionId,
      _end: data.end ?? false,
    });
    if (error) throw new Error("Session invalide");
    return res as { active: boolean; balance: number; charged?: number; unlimited?: boolean };
  });
