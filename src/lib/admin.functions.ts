import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Accès réservé à l'administrateur.");
}

export const getDecartKeyInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value, updated_at")
      .eq("key", "decart_api_key")
      .maybeSingle();
    const env = process.env["DECART_API_KEY"];
    const active = data?.value ?? env ?? null;
    return {
      source: data?.value ? ("admin" as const) : env ? ("default" as const) : ("none" as const),
      masked: active ? `${active.slice(0, 4)}••••••••${active.slice(-4)}` : null,
      updatedAt: data?.updated_at ?? null,
    };
  });

export const setDecartKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ key: z.string().trim().min(10).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const res = await fetch("https://api.decart.ai/v1/client/tokens", {
      method: "POST",
      headers: { "X-API-KEY": data.key, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 60 }),
    });
    if (!res.ok) throw new Error("Clé refusée par Decart AI. Vérifiez-la et réessayez.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "decart_api_key", value: data.key, updated_at: new Date().toISOString(), updated_by: context.userId });
    if (error) throw new Error("Enregistrement impossible.");
    return { ok: true };
  });

export const resetDecartKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("app_settings").delete().eq("key", "decart_api_key");
    return { ok: true };
  });
