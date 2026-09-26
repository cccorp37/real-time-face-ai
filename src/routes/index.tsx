import { createFileRoute, Link } from "@tanstack/react-router";
import { ScanFace, Zap, ShieldCheck, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FaceMorph Live — Face swap en direct dans votre navigateur" },
      { name: "description", content: "Remplacez votre visage par un avatar en temps réel depuis votre caméra, propulsé par Decart AI." },
      { property: "og:title", content: "FaceMorph Live — Face swap en direct" },
      { property: "og:description", content: "Remplacez votre visage par un avatar en temps réel depuis votre caméra." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Zap, title: "Temps réel", text: "Votre caméra transformée en direct, avec une latence minimale." },
  { icon: ScanFace, title: "Vos avatars", text: "Importez une photo de référence et changez d'identité en un clic." },
  { icon: Coins, title: "Paiement à la seconde", text: "1 point = 1 seconde de live. 120 points offerts." },
  { icon: ShieldCheck, title: "Sécurisé", text: "Clé API côté serveur, images privées, consentement explicite." },
];

function Landing() {
  return (
    <div className="min-h-screen overflow-hidden">
      <header className="mx-auto flex max-w-6xl items-center px-5 py-5">
        <span className="font-display text-xl font-extrabold">
          Face<span className="text-primary">Morph</span>
        </span>
        <Button asChild variant="ghost" className="ml-auto">
          <Link to="/auth">Connexion</Link>
        </Button>
      </header>
      <section className="relative mx-auto max-w-6xl px-5 pb-20 pt-14 md:pt-24">
        <div className="pointer-events-none absolute -right-40 -top-20 h-[28rem] w-[28rem] rounded-full bg-accent/30 blur-3xl" />
        <div className="pointer-events-none absolute -left-32 top-40 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
        <p className="relative inline-block rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
          Live · Avatar · Caméra
        </p>
        <h1 className="relative mt-6 max-w-3xl text-5xl font-extrabold leading-[0.95] tracking-tight md:text-7xl">
          Changez de visage.
          <br />
          <span className="text-primary">En direct.</span>
        </h1>
        <p className="relative mt-6 max-w-xl text-lg text-muted-foreground">
          Allumez votre caméra, choisissez un avatar et devenez quelqu'un d'autre instantanément — directement dans votre navigateur.
        </p>
        <div className="relative mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg" className="rounded-full px-8">
            <Link to="/studio">Lancer le live</Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="rounded-full px-8">
            <Link to="/auth">Créer un compte gratuit</Link>
          </Button>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-5 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-3xl border border-border bg-card p-6">
            <f.icon className="h-7 w-7 text-primary" />
            <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
          </div>
        ))}
      </section>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        Usage responsable uniquement — n'utilisez jamais l'image d'une personne sans son accord.
      </footer>
    </div>
  );
}
