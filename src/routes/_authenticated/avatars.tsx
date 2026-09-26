import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listAvatars, uploadAvatar, deleteAvatar } from "@/lib/faceswap.functions";
import { profileQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/avatars")({
  head: () => ({
    meta: [
      { title: "Mes avatars — FaceMorph" },
      { name: "description", content: "Importez et gérez vos avatars pour le face swap en direct." },
      { property: "og:title", content: "Mes avatars — FaceMorph" },
      { property: "og:description", content: "Importez et gérez vos avatars pour le face swap." },
    ],
  }),
  component: AvatarsPage,
});

function toBase64(file: File) {
  return new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function AvatarsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAvatars);
  const upload = useServerFn(uploadAvatar);
  const del = useServerFn(deleteAvatar);
  const { data: avatars = [], isLoading } = useQuery({ queryKey: ["avatars"], queryFn: () => list() });
  const { data: profile } = useQuery(profileQuery);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return toast.error("Format JPG, PNG ou WEBP");
    if (file.size > 6 * 1024 * 1024) return toast.error("6 Mo maximum");
    setBusy(true);
    try {
      await upload({ data: { name: name || "Avatar", contentType: file.type as "image/png", base64: await toBase64(file) } });
      toast.success("Avatar ajouté");
      setFile(null);
      setName("");
      qc.invalidateQueries({ queryKey: ["avatars"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-extrabold">Mes avatars</h1>
      {profile && !profile.consent_accepted_at ? (
        <div className="rounded-3xl border border-accent/50 bg-card p-6 text-sm">
          Vous devez accepter le consentement biométrique avant d'importer un visage.{" "}
          <Link to="/settings" className="font-semibold text-primary underline">Aller aux réglages</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 sm:flex-row sm:items-end">
          <label className="flex-1 space-y-1.5 text-sm">
            <span>Photo (visage bien éclairé, de face)</span>
            <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <label className="space-y-1.5 text-sm sm:w-48">
            <span>Nom</span>
            <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Avatar" />
          </label>
          <Button type="submit" disabled={!file || busy} className="rounded-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />} Importer
          </Button>
        </form>
      )}
      {isLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      ) : avatars.length === 0 ? (
        <p className="text-muted-foreground">Aucun avatar pour l'instant.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {avatars.map((a) => (
            <div key={a.id} className="group overflow-hidden rounded-3xl border border-border bg-card">
              {a.url && <img src={a.url} alt={a.name} className="aspect-square w-full object-cover" />}
              <div className="flex items-center justify-between p-3">
                <span className="truncate text-sm font-medium">{a.name}</span>
                <button
                  aria-label="Supprimer"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    if (!confirm("Supprimer cet avatar ?")) return;
                    await del({ data: { id: a.id } });
                    qc.invalidateQueries({ queryKey: ["avatars"] });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
