import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, ShieldCheck, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminQuery } from "@/lib/queries";
import { getDecartKeyInfo, setDecartKey, resetDecartKey } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administration — FaceMorph" },
      { name: "description", content: "Espace administrateur : clé API Decart AI et accès Premium." },
      { property: "og:title", content: "Administration — FaceMorph" },
      { property: "og:description", content: "Espace administrateur : clé API Decart AI et accès Premium." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const { data: isAdmin, isLoading } = useQuery(adminQuery);
  const fetchInfo = useServerFn(getDecartKeyInfo);
  const save = useServerFn(setDecartKey);
  const reset = useServerFn(resetDecartKey);
  const { data: info } = useQuery({ queryKey: ["decart-key"], queryFn: () => fetchInfo(), enabled: !!isAdmin });
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  if (isLoading) return null;
  if (!isAdmin)
    return (
      <div className="py-20 text-center text-muted-foreground">
        Accès réservé à l'administrateur. <Link to="/studio" className="text-primary underline">Retour</Link>
      </div>
    );

  async function submit() {
    setBusy(true);
    try {
      await save({ data: { key } });
      setKey("");
      toast.success("Nouvelle clé active pour toute l'application.");
      qc.invalidateQueries({ queryKey: ["decart-key"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="flex items-center gap-2 text-3xl font-extrabold">
        <ShieldCheck className="h-7 w-7 text-primary" /> Administration
      </h1>

      <section className="rounded-3xl border border-primary/40 bg-card p-6">
        <h2 className="flex items-center gap-2 font-bold"><Crown className="h-5 w-5 text-primary" /> Accès Premium illimité</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Live swap sans limite de points ni recharge</li>
          <li>Aucun filigrane, qualité 1080p</li>
          <li>Avatars illimités et toutes les fonctions Premium</li>
        </ul>
      </section>

      <section className="rounded-3xl border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 font-bold"><KeyRound className="h-5 w-5" /> Clé API Decart AI</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Clé actuelle : <span className="font-mono text-foreground">{info?.masked ?? "aucune"}</span>
          {info?.source === "admin" && info.updatedAt && ` · définie le ${new Date(info.updatedAt).toLocaleString("fr-FR")}`}
          {info?.source === "default" && " · clé par défaut"}
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Collez la nouvelle clé API" autoComplete="off" />
          <Button onClick={submit} disabled={busy || key.trim().length < 10}>{busy ? "Vérification…" : "Enregistrer"}</Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          La clé est vérifiée auprès de Decart AI puis utilisée immédiatement pour chaque nouveau live swap de tous les utilisateurs.
        </p>
        {info?.source === "admin" && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={async () => { await reset(); qc.invalidateQueries({ queryKey: ["decart-key"] }); toast.success("Clé par défaut rétablie."); }}>
            Revenir à la clé par défaut
          </Button>
        )}
      </section>
    </div>
  );
}
