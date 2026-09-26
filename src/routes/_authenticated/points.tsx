import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { walletQuery, transactionsQuery, sessionsQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/points")({
  head: () => ({
    meta: [
      { title: "Mes points — FaceMorph" },
      { name: "description", content: "Solde de points et historique de consommation." },
      { property: "og:title", content: "Mes points — FaceMorph" },
      { property: "og:description", content: "Solde de points et historique de consommation." },
    ],
  }),
  component: PointsPage,
});

const LABELS: Record<string, string> = { live: "Session live", bonus: "Bonus de bienvenue", recharge: "Recharge", photo: "Photo swap", restyle: "Restyle" };
const PACKS = [
  { points: 600, price: "4,99 €" },
  { points: 2000, price: "12,99 €" },
  { points: 6000, price: "29,99 €" },
];

function PointsPage() {
  const { data: balance = 0 } = useQuery(walletQuery);
  const { data: tx = [] } = useQuery(transactionsQuery);
  const { data: sessions = [] } = useQuery(sessionsQuery);
  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-border bg-card p-8">
        <p className="text-sm text-muted-foreground">Solde disponible</p>
        <p className="mt-1 font-display text-6xl font-extrabold text-primary">{balance}</p>
        <p className="mt-2 text-sm text-muted-foreground">≈ {Math.floor(balance / 60)} min {balance % 60} s de live</p>
      </div>

      <section>
        <h2 className="mb-3 text-xl font-bold">Recharger</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {PACKS.map((p) => (
            <div key={p.points} className="rounded-3xl border border-border bg-card p-5">
              <p className="text-2xl font-extrabold">{p.points} pts</p>
              <p className="text-muted-foreground">{p.price}</p>
              <p className="mt-3 text-xs text-muted-foreground">Paiement bientôt disponible</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-xl font-bold">Historique</h2>
          <ul className="divide-y divide-border rounded-3xl border border-border bg-card">
            {tx.length === 0 && <li className="p-4 text-sm text-muted-foreground">Aucune opération.</li>}
            {tx.map((t) => (
              <li key={t.id} className="flex justify-between p-4 text-sm">
                <span>
                  {LABELS[t.type] ?? t.type}
                  <span className="block text-xs text-muted-foreground">{format(new Date(t.created_at), "d MMM HH:mm", { locale: fr })}</span>
                </span>
                <span className={t.delta > 0 ? "font-semibold text-primary" : "font-semibold"}>{t.delta > 0 ? "+" : ""}{t.delta}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-3 text-xl font-bold">Sessions live</h2>
          <ul className="divide-y divide-border rounded-3xl border border-border bg-card">
            {sessions.length === 0 && <li className="p-4 text-sm text-muted-foreground">Aucune session.</li>}
            {sessions.map((s) => (
              <li key={s.id} className="flex justify-between p-4 text-sm">
                <span>
                  {format(new Date(s.started_at), "d MMM HH:mm", { locale: fr })} · {s.resolution}
                  <span className="block text-xs text-muted-foreground">{s.status === "active" ? "En cours" : "Terminée"}</span>
                </span>
                <span>{s.seconds_billed} s</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
