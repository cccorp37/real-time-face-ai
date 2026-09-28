import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Circle, Loader2, Play, Square, Download, Camera, Eye, EyeOff, Maximize, Minimize,
  RectangleHorizontal, RectangleVertical, Square as SquareIcon, ScanFace,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { listAvatars, startLive, heartbeatLive } from "@/lib/faceswap.functions";
import { profileQuery, walletQuery, adminQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/studio")({
  head: () => ({
    meta: [
      { title: "Studio Live — FaceMorph" },
      { name: "description", content: "Lancez votre face swap en direct avec votre avatar." },
      { property: "og:title", content: "Studio Live — FaceMorph" },
      { property: "og:description", content: "Lancez votre face swap en direct avec votre avatar." },
    ],
  }),
  component: Studio,
});

type Status = "idle" | "camera" | "connecting" | "live";

function Studio() {
  const qc = useQueryClient();
  const fetchAvatars = useServerFn(listAvatars);
  const start = useServerFn(startLive);
  const beat = useServerFn(heartbeatLive);
  const { data: avatars = [] } = useQuery({ queryKey: ["avatars"], queryFn: () => fetchAvatars() });
  const { data: profile } = useQuery(profileQuery);
  const { data: balance = 0 } = useQuery(walletQuery);

  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recUrl, setRecUrl] = useState<string | null>(null);

  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const camStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const rt = useRef<{ disconnect: () => void } | null>(null);
  const sessionId = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const { data: isAdmin } = useQuery(adminQuery);
  const [shape, setShape] = useState<"landscape" | "square" | "portrait">("landscape");
  const [showCam, setShowCam] = useState(true);
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const on = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  useEffect(() => {
    if (!selected && avatars.length) setSelected(profile?.active_avatar_id ?? avatars[0]!.id);
  }, [avatars, profile, selected]);

  useEffect(() => () => void stopAll(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status === "live" && remoteRef.current && remoteStream.current) {
      remoteRef.current.srcObject = remoteStream.current;
      remoteRef.current.play().catch(() => {});
    }
  }, [status]);

  async function openCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: "user" },
        audio: false,
      });
      camStream.current = s;
      if (localRef.current) localRef.current.srcObject = s;
      setStatus("camera");
    } catch {
      toast.error("Accès à la caméra refusé. Autorisez-la dans votre navigateur.");
    }
  }

  async function goLive() {
    if (!selected) { toast.error("Choisissez un avatar."); return; }
    if (!camStream.current) await openCamera();
    if (!camStream.current) return;
    setStatus("connecting");
    try {
      const ticket = await start({ data: { avatarId: selected } });
      sessionId.current = ticket.sessionId;
      const { createDecartClient, models } = await import("@decartai/sdk");
      const client = createDecartClient({ apiKey: ticket.clientKey });
      let image: Blob | undefined;
      if (ticket.avatarUrl) {
        const r = await fetch(ticket.avatarUrl);
        if (r.ok) image = await r.blob();
      }
      const videoOnly = new MediaStream(camStream.current.getVideoTracks());
      const connectPromise = client.realtime.connect(videoOnly, {
        model: models.realtime("lucy-2.5"),
        preferredVideoCodec: "vp8",
        onRemoteStream: (stream: MediaStream) => {
          remoteStream.current = stream;
          if (remoteRef.current) {
            remoteRef.current.srcObject = stream;
            remoteRef.current.play().catch(() => {});
          }
        },
        initialState: {
          prompt: { text: "Substitute the face with the one in the reference image, keep expressions and head movements", enhance: false },
          ...(image ? { image } : {}),
        },
      });
      let timedOut = false;
      const conn = await Promise.race([
        connectPromise,
        new Promise<never>((_, rej) =>
          setTimeout(() => { timedOut = true; rej(new Error("NETWORK_TIMEOUT")); }, 25000),
        ),
      ]).catch((err) => {
        if (timedOut) connectPromise.then((c) => c.disconnect()).catch(() => {});
        throw err;
      });
      rt.current = conn;
      conn.on("error", (err) => console.error("[Decart] error", err));
      conn.on("sessionEnded", () => {
        if (sessionId.current) { toast.warning("Session terminée par le service."); stopLive(); }
      });
      conn.on("connectionChange", (s) => {
        console.info("[Decart] state", s);
        if (s === "disconnected" && sessionId.current) stopLive();
      });
      setStatus("live");
      setElapsed(0);
      timer.current = window.setInterval(async () => {
        setElapsed((e) => e + 5);
        try {
          const sid = sessionId.current;
          if (!sid) return;
          const r = await beat({ data: { sessionId: sid } });
          qc.setQueryData(walletQuery.queryKey, r.balance);
          if (!r.active) {
            toast.warning("Solde épuisé — session terminée.");
            stopLive(false);
          }
        } catch {
          stopLive(false);
        }
      }, 5000);
    } catch (e) {
      console.error("[Decart] connect failed", e);
      const raw = e instanceof Error ? e.message : String(e);
      const msg = /NETWORK_TIMEOUT|pc connection|ice/i.test(raw)
        ? "La connexion vidéo n'a pas pu s'établir. Votre réseau bloque peut-être le flux temps réel : essayez un autre réseau (Wi-Fi / 4G), désactivez VPN ou bloqueur, puis réessayez. Vos points n'ont été débités que pour les quelques secondes d'essai."
        : `Échec de connexion au live : ${raw}`;
      toast.error(msg, { duration: 10000 });
      rt.current?.disconnect();
      rt.current = null;
      if (sessionId.current) {
        try {
          const r = await beat({ data: { sessionId: sessionId.current, end: true } });
          qc.setQueryData(walletQuery.queryKey, r.balance);
        } catch { /* ignore */ }
        sessionId.current = null;
      }
      setStatus("camera");
    }
  }

  async function stopLive(bill = true) {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    rt.current?.disconnect();
    rt.current = null;
    if (bill && sessionId.current) {
      try {
        const r = await beat({ data: { sessionId: sessionId.current, end: true } });
        qc.setQueryData(walletQuery.queryKey, r.balance);
      } catch {
        /* ignore */
      }
    }
    sessionId.current = null;
    qc.invalidateQueries({ queryKey: ["transactions"] });
    setStatus(camStream.current ? "camera" : "idle");
  }

  async function stopAll() {
    await stopLive();
    camStream.current?.getTracks().forEach((t) => t.stop());
    camStream.current = null;
  }

  function toggleRecord() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    const src = remoteStream.current;
    if (!src) return;
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(src, { mimeType: MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "" });
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      setRecording(false);
      setRecUrl(URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })));
    };
    rec.start(1000);
    recorder.current = rec;
    setRecording(true);
  }

  const needsConsent = profile && !profile.consent_accepted_at;
  const premium = !!isAdmin || !!profile?.is_vip;
  const shapeClass = shape === "square" ? "aspect-square max-w-[640px]" : shape === "portrait" ? "aspect-[9/16] max-w-[420px]" : "aspect-video";

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    else await stageRef.current?.requestFullscreen().catch(() => toast.error("Plein écran indisponible sur cet appareil."));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-border bg-card p-1">
            {([
              ["landscape", "Rectangle", RectangleHorizontal],
              ["square", "Carré", SquareIcon],
              ["portrait", "Portrait", RectangleVertical],
            ] as const).map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setShape(k)}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${shape === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setShowCam((v) => !v)}>
            {showCam ? <EyeOff className="mr-1 h-4 w-4" /> : <Eye className="mr-1 h-4 w-4" />}
            {showCam ? "Masquer ma caméra" : "Afficher ma caméra"}
          </Button>
          <Button size="sm" variant="secondary" className="rounded-full" onClick={toggleFullscreen}>
            {isFs ? <Minimize className="mr-1 h-4 w-4" /> : <Maximize className="mr-1 h-4 w-4" />}
            {isFs ? "Quitter plein écran" : "Plein écran"}
          </Button>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div
            ref={stageRef}
            className={`relative mx-auto w-full overflow-hidden rounded-3xl border border-border bg-card ${isFs ? "flex items-center justify-center bg-background" : shapeClass}`}
          >
            <div className={`relative ${isFs ? `h-full max-h-screen ${shape === "landscape" ? "aspect-video" : shape === "square" ? "aspect-square" : "aspect-[9/16]"}` : "absolute inset-0"}`}>
              <video ref={remoteRef} autoPlay playsInline className={`absolute inset-0 h-full w-full object-cover ${status === "live" ? "" : "hidden"}`} />
              {status !== "live" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-sm text-muted-foreground">
                  {status === "connecting" ? (
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  ) : status === "idle" ? (
                    <>
                      <Camera className="h-10 w-10" />
                      <Button onClick={openCamera} className="rounded-full">Activer la caméra</Button>
                    </>
                  ) : (
                    <>
                      <ScanFace className="h-10 w-10" />
                      Le résultat du face swap s'affichera ici.
                    </>
                  )}
                </div>
              )}
              {status === "live" && (
                <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-sm font-semibold">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" /> LIVE · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
                </div>
              )}
              {status === "live" && !premium && (
                <span className="absolute bottom-3 left-3 text-xs font-bold opacity-60">FaceMorph</span>
              )}
              {isFs && (
                <button onClick={toggleFullscreen} aria-label="Quitter le plein écran" className="absolute right-3 top-3 rounded-full bg-background/80 p-2">
                  <Minimize className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className={`${showCam && status !== "idle" ? "" : "hidden"} w-40 shrink-0 self-end md:self-start`}>
            <p className="mb-1 text-xs text-muted-foreground">Ma caméra</p>
            <video ref={localRef} autoPlay playsInline muted className="aspect-[3/4] w-full -scale-x-100 rounded-2xl border border-border object-cover" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {status !== "live" ? (
            <Button size="lg" className="rounded-full" onClick={goLive} disabled={status === "connecting" || !selected || !!needsConsent || (!isAdmin && balance <= 0)}>
              <Play className="mr-1 h-4 w-4" /> Démarrer le swap
            </Button>
          ) : (
            <>
              <Button size="lg" variant="destructive" className="rounded-full" onClick={() => stopLive()}>
                <Square className="mr-1 h-4 w-4" /> Arrêter
              </Button>
              <Button size="lg" variant="secondary" className="rounded-full" onClick={toggleRecord}>
                <Circle className={`mr-1 h-4 w-4 ${recording ? "fill-destructive text-destructive" : ""}`} />
                {recording ? "Stop enregistrement" : "Enregistrer"}
              </Button>
            </>
          )}
          {recUrl && (
            <Button asChild variant="ghost" className="rounded-full">
              <a href={recUrl} download="facemorph.webm">
                <Download className="mr-1 h-4 w-4" /> Télécharger la vidéo
              </a>
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            {isAdmin ? "Accès Premium illimité · sans filigrane" : `1 point / seconde · ${balance} restants`}
          </span>
        </div>
        {needsConsent && (
          <p className="mt-3 text-sm text-accent">
            Acceptez d'abord le consentement dans <Link to="/settings" className="underline">Réglages</Link>.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Astuce : pour utiliser le rendu dans Zoom, Meet ou WhatsApp Web, partagez cet onglet depuis l'appli de visioconférence.
        </p>
      </section>

      <aside className="rounded-3xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Avatar</h2>
          <Link to="/avatars" className="text-sm text-primary">Gérer</Link>
        </div>
        {avatars.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Aucun avatar.
            <Button asChild className="mt-3 w-full rounded-full">
              <Link to="/avatars">Ajouter un avatar</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-2">
            {avatars.map((a) => (
              <button
                key={a.id}
                disabled={status === "live"}
                onClick={() => setSelected(a.id)}
                className={`overflow-hidden rounded-2xl border-2 ${selected === a.id ? "border-primary" : "border-transparent"}`}
              >
                {a.url && <img src={a.url} alt={a.name} className="aspect-square w-full object-cover" />}
                <span className="block truncate px-1 py-1 text-xs">{a.name}</span>
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
