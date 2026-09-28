import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, LogOut, ScanFace, Users, Wallet, Settings, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { walletQuery, adminQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppLayout,
});

const NAV = [
  { to: "/studio", label: "Live", icon: ScanFace },
  { to: "/avatars", label: "Avatars", icon: Users },
  { to: "/points", label: "Points", icon: Wallet },
  { to: "/settings", label: "Réglages", icon: Settings },
] as const;

function AppLayout() {
  const { data: balance } = useQuery(walletQuery);
  const { data: isAdmin } = useQuery(adminQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/studio" className="font-display text-xl font-extrabold tracking-tight">
            Face<span className="text-primary">Morph</span>
          </Link>
          <nav className="hidden gap-1 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded-full px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "bg-secondary !text-foreground" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {isAdmin && (
              <Link to="/admin" aria-label="Administration" className="flex items-center gap-1 rounded-full border border-primary/40 px-3 py-1 text-sm font-semibold text-primary">
                <ShieldCheck className="h-4 w-4" /> Admin
              </Link>
            )}
            <Link to="/points" className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary">
              <Coins className="h-4 w-4" /> {isAdmin ? "∞" : balance ?? "…"}
            </Link>
            <button
              aria-label="Se déconnecter"
              className="text-muted-foreground hover:text-foreground"
              onClick={async () => {
                await supabase.auth.signOut();
                qc.clear();
                navigate({ to: "/" });
              }}
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-background/95 md:hidden">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="flex flex-col items-center gap-1 py-2.5 text-xs text-muted-foreground"
            activeProps={{ className: "!text-primary" }}
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
