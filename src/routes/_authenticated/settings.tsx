import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { profileQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Réglages — FaceMorph" },
      { name: "description", content: "Profil, consentement biométrique et abonnement." },
      { property: "og:title", content: "Réglages — FaceMorph" },
      { property: "og:description", content: "Profil, consentement biométrique et abonnement." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: profile } = useQuery(profileQuery);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  useEffect(() => setName(profile?.display_name ?? ""), [profile]);

  async function update(values: { display_name?: string; consent_accepted_at?: string | null }) {
    if (!profile) return;
    const { error } = await supabase.from("profiles").update(values).eq("user_id", profile.user_id);
    if (error) { toast.error(error.message); return; }
    toast.success("Enregistré");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-extrabold">Réglages</h1>
      <section className="rounded-3xl border border-border bg-card p-6">
        <h2 className="font-bold">Profil</h2>
        <div className="mt-4 flex gap-3">
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <Button onClick={() => update({ display_name: name.trim() })}>Enregistrer</Button>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-6">
        <h2 className="font-bold">Consentement biométrique</h2>
        {profile?.consent_accepted_at ? (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-muted-foreground">Accepté le {new Date(profile.consent_accepted_at).toLocaleString("fr-FR")}.</p>
            <Button variant="secondary" onClick={() => update({ consent_accepted_at: null })}>Retirer mon consentement</Button>
          </div>
        ) : (
          <div className="mt-3 space-y-4 text-sm text-muted-foreground">
            <p>
              Les images importées sont traitées par notre partenaire Decart AI pour générer la transformation en direct. Vous certifiez
              détenir les droits sur chaque visage importé et vous vous engagez à ne jamais usurper l'identité d'autrui ni produire de
              contenu trompeur, diffamatoire ou sexuel.
            </p>
            <label className="flex items-start gap-3 text-foreground">
              <Checkbox checked={agree} onCheckedChange={(v) => setAgree(!!v)} className="mt-0.5" />
              J'accepte ces conditions et le traitement de données biométriques.
            </label>
            <Button disabled={!agree} onClick={() => update({ consent_accepted_at: new Date().toISOString() })}>Accepter</Button>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-primary/40 bg-card p-6">
        <h2 className="font-bold">VIP {profile?.is_vip && <span className="text-primary">· actif</span>}</h2>
        <p className="mt-2 text-sm text-muted-foreground">1080p, sans filigrane, priorité de traitement. Abonnement bientôt disponible.</p>
      </section>
    </div>
  );
}
