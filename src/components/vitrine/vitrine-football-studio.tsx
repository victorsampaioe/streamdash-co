import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toPng } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { CalendarDays, Check, Download, ImagePlus, RefreshCw, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import {
  getVitrineFootballMatches, getVitrineFootballPlayers, getVitrineFootballImage,
  type FootballMatch, type FootballPlayer,
} from "@/lib/vitrine-football.functions";

type Kind = "today" | "featured";
type Format = "feed" | "story" | "landscape";
type TeamSide = "home" | "away";
const DIMENSIONS: Record<Format, { width: number; height: number; title: string }> = {
  feed: { width: 1080, height: 1080, title: "Feed 1080 × 1080" },
  story: { width: 1080, height: 1920, title: "Story 1080 × 1920" },
  landscape: { width: 1200, height: 675, title: "Banner 1200 × 675" },
};
const AI_WORKER_URL = "https://streammonitor-vitrine-ai.victorsampaio133.workers.dev/generate";
const getToday = () => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const dateDisplay = (day: string) => {
  const d = new Date(day + "T12:00:00-03:00");
  return Number.isNaN(d.getTime()) ? day : new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza", day: "2-digit", month: "long", year: "numeric",
  }).format(d);
};
function initials(name: string) {
  return name.trim().split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}
async function uploadedDataUrl(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error("Envie imagem PNG, JPG ou WEBP com até 5 MB.");
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível abrir a imagem."));
    reader.readAsDataURL(file);
  });
}
function TeamIdentity({ name, badge, size = 104 }: { name: string; badge?: string; size?: number }) {
  return <div className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/10"
    style={{ width: size, height: size }}>
    {badge ? <img src={badge} alt="" className="h-[77%] w-[77%] object-contain" /> :
      <span className="font-black text-white/90" style={{ fontSize: size * 0.28 }}>{initials(name)}</span>}
  </div>;
}
function FixtureCard({ m, badges, dense }: { m: FootballMatch; badges: Record<string, string>; dense?: boolean }) {
  return <div className="flex items-center gap-3 rounded-[24px] border border-white/15 bg-slate-950/60 px-5 py-4 backdrop-blur-md">
    <div className="min-w-0 flex-1 flex items-center gap-4">
      <TeamIdentity name={m.home} badge={badges[m.homeBadge]} size={dense ? 68 : 83} />
      <div className="min-w-0">
        <div className="truncate text-[25px] font-extrabold leading-tight text-white">{m.home}</div>
        <div className="my-1 text-[18px] font-black text-sky-300">VS</div>
        <div className="truncate text-[25px] font-extrabold leading-tight text-white">{m.away}</div>
      </div>
    </div>
    <div className="shrink-0 text-right">
      <TeamIdentity name={m.away} badge={badges[m.awayBadge]} size={dense ? 68 : 83} />
      <div className="mt-3 text-[25px] font-black text-white">{m.time}</div>
      <div className="max-w-[180px] text-[13px] font-bold uppercase leading-tight tracking-wider text-slate-300">{m.league}</div>
    </div>
  </div>;
}

function FootballArt({
  kind, match, matches, format, day, headline, brand, logo, stadium, badgeImages, photo,
  playerName,
}: {
  kind: Kind; match: FootballMatch | null; matches: FootballMatch[];
  format: Format; day: string; headline: string; brand: string; logo: string;
  stadium: string; badgeImages: Record<string, string>; photo: string; playerName: string;
}) {
  const dims = DIMENSIONS[format];
  const story = format === "story";
  const landscape = format === "landscape";
  const list = matches.slice(0, landscape ? 3 : story ? 7 : 5);
  return <div className="relative isolate overflow-hidden bg-[#050d22] font-sans text-white"
    style={{ width: dims.width, height: dims.height }}>
    {stadium ? <img alt="" src={stadium} className="absolute inset-0 h-full w-full object-cover opacity-75" /> : <>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 52% 75%, #164a73 0%, #0e254c 35%, #050b1d 75%)" }} />
      <div className="absolute inset-x-[-200px] bottom-[-170px] h-[400px] rounded-[50%] border-[24px] border-sky-400/15 bg-emerald-700/10 blur-[4px]" />
      <div className="absolute left-0 top-0 h-[65%] w-[40%] bg-blue-500/20 blur-[130px]" />
    </>}
    <div className="absolute inset-0 bg-gradient-to-b from-[#040d24]/85 via-[#061329]/30 to-[#030819]/95" />
    <div className="absolute inset-x-0 top-0 h-[12px] bg-gradient-to-r from-blue-700 via-sky-300 to-blue-700" />
    <div className="absolute left-14 top-12 flex items-center gap-5">
      {logo ? <img src={logo} alt="" className="h-[75px] w-[75px] object-contain" /> :
        <div className="flex h-[74px] w-[74px] items-center justify-center rounded-2xl border border-sky-300/50 bg-blue-500/25 text-3xl font-black">SM</div>}
      <span className="text-[25px] font-black uppercase tracking-[0.13em]">{brand || "STREAM MONITOR"}</span>
    </div>
    <div className="absolute right-12 top-14 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-[17px] font-bold tracking-widest text-sky-200">VITRINE FUTEBOL</div>

    {kind === "today" ? <>
      <div className="absolute left-14 right-14" style={{ top: story ? 230 : landscape ? 142 : 170 }}>
        <div className="text-[23px] font-bold uppercase tracking-[0.25em] text-sky-300">{dateDisplay(day)}</div>
        <div className="mt-1 font-black uppercase leading-[1]" style={{ fontSize: story ? 106 : landscape ? 65 : 81 }}>
          {headline || "JOGOS DE HOJE"}
        </div>
        <div className="mt-4 h-2 w-36 rounded-full bg-sky-400" />
      </div>
      <div className="absolute left-14 right-14 grid gap-[14px]"
        style={{ top: story ? 480 : landscape ? 255 : 335 }}>
        {list.length ? list.map((m) => <FixtureCard key={m.id} m={m} badges={badgeImages} dense={landscape} />) :
          <div className="rounded-3xl border border-white/20 bg-white/10 p-12 text-center text-3xl font-bold">Selecione partidas reais para montar esta arte.</div>}
      </div>
    </> : <>
      {photo && <img src={photo} alt="" className="absolute left-[-8%] bottom-0 h-[82%] w-[64%] object-contain object-bottom"
        style={{ filter: "drop-shadow(8px 10px 60px rgba(0,0,0,.55))" }} />}
      <div className="absolute left-14 right-14" style={{ top: story ? 290 : landscape ? 150 : 195 }}>
        <p className="font-black uppercase tracking-[0.24em] text-sky-300" style={{ fontSize: story ? 37 : 28 }}>
          {match?.league || "JOGO EM DESTAQUE"}
        </p>
        <h2 className="mt-4 max-w-[950px] font-black uppercase leading-[0.93]"
          style={{ fontSize: story ? 108 : landscape ? 79 : 89, textShadow: "0 8px 35px #0009" }}>
          {headline || "HOJE TEM JOGAÇO"}
        </h2>
      </div>
      <div className="absolute left-14 right-14 flex items-center justify-center gap-8 rounded-[34px] border border-white/20 bg-[#061328]/85 px-8 py-7 shadow-2xl backdrop-blur-md"
        style={{ bottom: story ? 250 : landscape ? 85 : 150 }}>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-4">
          <TeamIdentity name={match?.home || "Casa"} badge={match ? badgeImages[match.homeBadge] : undefined} size={story ? 140 : 108} />
          <div className="text-center text-[29px] font-black uppercase leading-tight">{match?.home || "Time mandante"}</div>
        </div>
        <div className="shrink-0 text-center">
          <div className="text-[58px] font-black italic text-sky-300">X</div>
          <div className="rounded-2xl bg-sky-400 px-6 py-2 text-[29px] font-black text-[#061328]">{match?.time || "--:--"}</div>
          <div className="mt-2 text-[17px] font-bold text-white/80">HORÁRIO DE FORTALEZA</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center gap-4">
          <TeamIdentity name={match?.away || "Visitante"} badge={match ? badgeImages[match.awayBadge] : undefined} size={story ? 140 : 108} />
          <div className="text-center text-[29px] font-black uppercase leading-tight">{match?.away || "Time visitante"}</div>
        </div>
      </div>
      {photo && playerName && <div className="absolute bottom-14 left-14 max-w-[450px] rounded-xl bg-black/65 px-5 py-3 text-[24px] font-bold uppercase tracking-wide">{playerName}</div>}
    </>}
    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-white/10 bg-[#03091b]/80 px-14 py-6 text-[17px] font-bold uppercase tracking-[0.16em] text-white/65">
      <span>ARTE CRIADA NO STREAM MONITOR</span>
      <span>{dateDisplay(day)} · BRT</span>
    </div>
  </div>;
}

export function VitrineFootballStudio() {
  const fetchGames = useServerFn(getVitrineFootballMatches);
  const fetchPlayers = useServerFn(getVitrineFootballPlayers);
  const fetchImage = useServerFn(getVitrineFootballImage);
  const [date, setDate] = useState(getToday);
  const [mode, setMode] = useState<Kind>("today");
  const [format, setFormat] = useState<Format>("feed");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [featuredId, setFeaturedId] = useState("");
  const [playerSide, setPlayerSide] = useState<TeamSide>("home");
  const [playerId, setPlayerId] = useState("");
  const [playerUpload, setPlayerUpload] = useState("");
  const [logo, setLogo] = useState("");
  const [brand, setBrand] = useState("Stream Monitor");
  const [headline, setHeadline] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [aiBackground, setAiBackground] = useState("");
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [badgeImages, setBadgeImages] = useState<Record<string, string>>({});
  const [playerRemote, setPlayerRemote] = useState("");
  const [maxWidth, setMaxWidth] = useState(520);
  const artRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const games = useQuery({
    queryKey: ["admin-football-games", date],
    queryFn: () => fetchGames({ data: { date } }),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const fixtures = useMemo(() => games.data?.matches ?? [], [games.data]);
  const featured = fixtures.find((m) => m.id === featuredId) ?? fixtures[0] ?? null;
  const visibleMatches = useMemo(() =>
    selectedIds.length ? fixtures.filter((m) => selectedIds.includes(m.id)) : fixtures.slice(0, 5),
    [fixtures, selectedIds]);
  const teamId = featured ? (playerSide === "home" ? featured.homeId : featured.awayId) : "";
  const players = useQuery({
    queryKey: ["admin-football-players", teamId],
    enabled: mode === "featured" && /^\d+$/.test(teamId),
    queryFn: () => fetchPlayers({ data: { teamId } }),
    staleTime: 60 * 60_000,
    retry: 0,
  });
  const athleteList = players.data?.players ?? [];
  const athlete = athleteList.find((x) => x.id === playerId) ?? null;

  useEffect(() => {
    setFeaturedId("");
    setSelectedIds([]);
    setAiBackground("");
  }, [date]);
  useEffect(() => {
    setPlayerId("");
    setPlayerUpload("");
    setPlayerRemote("");
  }, [featured?.id, playerSide]);
  useEffect(() => {
    if (playerId || !athleteList.length) return;
    // The first API result is a suggestion, NOT a verified starting player or star.
    const preferred = athleteList.find((p) => p.image && p.creativeCommons) ?? athleteList[0];
    if (preferred) setPlayerId(preferred.id);
  }, [athleteList, playerId]);
  useEffect(() => {
    const node = measureRef.current;
    if (!node) return;
    const update = () => setMaxWidth(Math.max(270, Math.min(550, node.clientWidth - 16)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const sizes = DIMENSIONS[format];
  const scale = maxWidth / sizes.width;

  const usedBadges = useMemo(() => {
    const matches = mode === "today" ? visibleMatches.slice(0, format === "landscape" ? 3 : format === "story" ? 7 : 5) : featured ? [featured] : [];
    return [...new Set(matches.flatMap((m) => [m.homeBadge, m.awayBadge]).filter(Boolean))];
  }, [mode, visibleMatches, featured, format]);

  useEffect(() => {
    if (!rightsConfirmed || !usedBadges.length) { setBadgeImages({}); return; }
    let disposed = false;
    void (async () => {
      const results = await Promise.all(usedBadges.map(async (url) => {
        try {
          const response = await fetchImage({ data: { url, rightsConfirmed: true } });
          return [url, response.dataUrl] as const;
        } catch { return [url, ""] as const; }
      }));
      if (!disposed) setBadgeImages(Object.fromEntries(results));
    })();
    return () => { disposed = true; };
  }, [rightsConfirmed, usedBadges, fetchImage]);

  useEffect(() => {
    setPlayerRemote("");
    if (!rightsConfirmed || !athlete?.image || !athlete.creativeCommons || mode !== "featured" || playerUpload) return;
    let disposed = false;
    void fetchImage({ data: { url: athlete.image, rightsConfirmed: true } })
      .then((v) => { if (!disposed) setPlayerRemote(v.dataUrl); })
      .catch(() => { if (!disposed) setPlayerRemote(""); });
    return () => { disposed = true; };
  }, [rightsConfirmed, athlete?.image, athlete?.creativeCommons, playerUpload, mode, fetchImage]);

  const playerPhoto = rightsConfirmed ? playerUpload || playerRemote : "";
  const effectiveHeadline = headline.trim() || (mode === "today" ? "JOGOS DE HOJE" : "HOJE TEM JOGAÇO");

  async function onFile(file: File | undefined, type: "logo" | "player") {
    if (!file) return;
    try {
      const dataUrl = await uploadedDataUrl(file);
      if (type === "logo") setLogo(dataUrl);
      else setPlayerUpload(dataUrl);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Imagem inválida."); }
  }

  async function generateStadium() {
    if (generating) return;
    setGenerating(true);
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session?.access_token) throw new Error("Faça login novamente.");
      const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!publicKey) throw new Error("Chave pública do projeto não configurada.");
      const response = await fetch(AI_WORKER_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: publicKey,
          "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Estádio cinematográfico original",
          overview: "A beautiful packed professional football soccer stadium at dusk under enormous bright floodlights, dramatic clouds, green pitch, luminous blue smoke and cinematic energy, completely original architecture and anonymous unrecognizable crowd, no players, no faces, no team symbols, no signage and no words.",
          genre: "football, sport, stadium, matchday, blue cinematic atmosphere",
          mediaType: "movie",
          style: "acao",
          format,
        }),
      });
      const data = await response.json() as { image?: string; error?: string };
      if (!response.ok || !data.image?.startsWith("data:image/")) {
        throw new Error(data.error || "A Cloudflare não retornou a imagem.");
      }
      setAiBackground(data.image);
      toast.success("Estádio gerado pela Cloudflare IA. Agora finalize sua arte.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o cenário.");
    } finally { setGenerating(false); }
  }
  async function download() {
    if (!artRef.current || exporting) return;
    if (mode === "today" && visibleMatches.length === 0) return toast.error("Selecione pelo menos uma partida real.");
    if (mode === "featured" && !featured) return toast.error("Selecione uma partida real.");
    setExporting(true);
    try {
      const png = await toPng(artRef.current, {
        pixelRatio: 1,
        backgroundColor: "#050d22",
        skipFonts: true,
        cacheBust: false,
      });
      const a = document.createElement("a");
      a.href = png;
      a.download = `stream-monitor-futebol-${mode}-${date}-${format}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Arte PNG gerada com sucesso.");
    } catch {
      toast.error("Falha ao exportar a arte. Remova imagens externas ou tente outro navegador.");
    } finally { setExporting(false); }
  }

  return <div className="mx-auto w-full max-w-[1550px] space-y-6 pb-20">
    <div className="overflow-hidden rounded-3xl border border-sky-500/25 bg-gradient-to-r from-[#071329] via-[#0c234b] to-[#092350] p-6 text-white shadow-2xl sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-400/40 bg-blue-500/15 px-4 py-2 text-xs font-bold uppercase tracking-widest text-blue-200">
            <ShieldCheck className="h-4 w-4" /> Teste privado · apenas admin
          </div>
          <h1 className="flex items-center gap-3 text-3xl font-black sm:text-4xl"><Trophy className="h-9 w-9 text-sky-300" /> Vitrine IA Futebol</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Programação real do dia e arte de destaque com cenário da Cloudflare IA, escudos e foto autorizada do jogador. Nada é divulgado automaticamente.</p>
        </div>
        <div className="rounded-2xl border border-white/20 bg-white/10 px-5 py-4 text-sm text-slate-200">Fuso dos jogos: <strong>Fortaleza / Brasília</strong><br />Fonte: <strong>TheSportsDB</strong></div>
      </div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,470px)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card className="space-y-5 p-5">
          <h2 className="text-lg font-bold">1. Escolha o tipo de arte</h2>
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={() => { setMode("today"); setHeadline(""); }} variant={mode === "today" ? "default" : "outline"} className="h-14">Jogos de Hoje</Button>
            <Button onClick={() => { setMode("featured"); setHeadline(""); }} variant={mode === "featured" ? "default" : "outline"} className="h-14">Jogo em Destaque</Button>
          </div>
          <label className="block text-sm font-semibold">Data dos jogos
            <Input type="date" className="mt-2" value={date} onChange={(e) => setDate(e.target.value || getToday())} />
          </label>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">Partidas encontradas: {fixtures.length}</span>
            <Button variant="outline" size="sm" onClick={() => void games.refetch()} disabled={games.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${games.isFetching ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
          {games.isLoading && <p className="text-sm text-muted-foreground">Consultando a programação esportiva…</p>}
          {games.isError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">Não foi possível consultar os jogos. Verifique a conexão e tente novamente.</p>}
          {!!games.data && <p className="rounded-lg bg-amber-500/10 p-3 text-xs leading-5 text-amber-200">
            Fonte gratuita: até 3 partidas por liga e data; a programação pode estar incompleta.
            Consulta de {games.data.sourcesSucceeded}/{games.data.sourcesTotal} grupos concluída.
            Confira horários antes de divulgar. Dados: TheSportsDB.
          </p>}
          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {fixtures.map((m) => {
              const checked = mode === "featured" ? featured?.id === m.id : (selectedIds.length ? selectedIds.includes(m.id) : fixtures.slice(0, 5).some((v) => v.id === m.id));
              return <button key={m.id} type="button"
                onClick={() => {
                  if (mode === "featured") setFeaturedId(m.id);
                  else {
                    const defaults = selectedIds.length ? selectedIds : fixtures.slice(0, 5).map((v) => v.id);
                    setSelectedIds(checked ? defaults.filter((id) => id !== m.id) : [...defaults, m.id].slice(0, 7));
                  }
                }}
                className={`w-full rounded-xl border p-3 text-left text-sm transition-colors ${checked ? "border-sky-400/60 bg-sky-500/10" : "border-border hover:bg-muted/60"}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${checked ? "border-sky-400 bg-sky-500 text-white" : "border-slate-500"}`}>
                    {checked && <Check className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold">{m.home} <span className="text-muted-foreground">×</span> {m.away}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{m.league} · {m.time} BRT</div>
                  </div>
                </div>
              </button>;
            })}
            {!games.isLoading && !fixtures.length && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Nenhum jogo confirmado pela fonte gratuita nesta data. Escolha outra data ou tente atualizar.</p>}
          </div>
        </Card>

        {mode === "featured" && <Card className="space-y-4 p-5">
          <h2 className="text-lg font-bold">2. Jogador em destaque</h2>
          <div className="flex gap-3">
            <Button variant={playerSide === "home" ? "default" : "outline"} className="flex-1" onClick={() => setPlayerSide("home")}>{featured?.home || "Mandante"}</Button>
            <Button variant={playerSide === "away" ? "default" : "outline"} className="flex-1" onClick={() => setPlayerSide("away")}>{featured?.away || "Visitante"}</Button>
          </div>
          <p className="text-xs text-muted-foreground">Jogadores abaixo são sugestões do cadastro da fonte; a ferramenta não afirma quem será titular ou o principal atleta da partida.</p>
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
            <option value="">Escolha o jogador</option>
            {athleteList.map((p: FootballPlayer) => <option value={p.id} key={p.id}>
              {p.name}{p.position ? ` · ${p.position}` : ""}{p.image && p.creativeCommons ? " · foto disponível" : ""}
            </option>)}
          </select>
          {players.isLoading && <p className="text-xs text-muted-foreground">Buscando elenco…</p>}
          {athlete && !athlete.creativeCommons && <p className="text-xs text-amber-500">A licença da foto deste atleta não está verificada pela fonte. Utilize uma fotografia autorizada.</p>}
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 text-sm hover:bg-muted/40">
            <ImagePlus className="h-5 w-5 text-blue-400" />
            Enviar foto autorizada do jogador (PNG/JPG/WEBP)
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0], "player")} />
          </label>
          {playerUpload && <Button variant="outline" size="sm" onClick={() => setPlayerUpload("")}>Remover foto enviada</Button>}
        </Card>}

        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-bold">{mode === "featured" ? "3" : "2"}. Personalize sua arte</h2>
          <label className="block text-sm font-semibold">Formato
            <select value={format} onChange={(e) => { setFormat(e.target.value as Format); setAiBackground(""); }}
              className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3">
              {Object.entries(DIMENSIONS).map(([value, props]) => <option key={value} value={value}>{props.title}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">Chamada principal
            <Input className="mt-2" maxLength={50} placeholder={mode === "today" ? "Jogos de Hoje" : "Hoje tem jogaço!"} value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </label>
          <label className="block text-sm font-semibold">Marca
            <Input className="mt-2" maxLength={36} value={brand} onChange={(e) => setBrand(e.target.value)} />
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 text-sm hover:bg-muted/40">
            <ImagePlus className="h-5 w-5 text-blue-400" /> Adicionar minha logo (opcional)
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0], "logo")} />
          </label>
          <label className="flex items-start gap-3 rounded-lg bg-muted/50 p-4 text-sm leading-6">
            <input type="checkbox" checked={rightsConfirmed} onChange={(e) => setRightsConfirmed(e.target.checked)} className="mt-1 h-4 w-4 accent-blue-500" />
            <span>Confirmo ter autorização para usar as fotos e escudos selecionados. Sei que uma marcação Creative Commons na API não comprova sozinha todos os direitos de imagem, publicidade ou marca. Sem essa confirmação, a arte usa apenas nomes dos times e cenário original.</span>
          </label>
          <Button onClick={() => void generateStadium()} disabled={generating} className="h-12 w-full bg-blue-600 text-white hover:bg-blue-700">
            <Sparkles className={`mr-2 h-5 w-5 ${generating ? "animate-pulse" : ""}`} />{generating ? "Gerando cenário..." : "Gerar cenário com Cloudflare IA"}
          </Button>
          <p className="text-xs leading-5 text-muted-foreground">A IA cria somente o estádio original. Nomes, horários, escudos e a foto autorizada são adicionados no editor para evitar informações ou rostos inventados.</p>
        </Card>
      </div>

      <div className="min-w-0 space-y-5">
        <Card className="overflow-hidden p-4 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Prévia profissional</h2>
              <p className="text-sm text-muted-foreground">Arte privada; pronta para baixar e testar.</p>
            </div>
            <Button onClick={() => void download()} disabled={exporting || games.isLoading || !fixtures.length} className="h-11">
              <Download className="mr-2 h-4 w-4" /> {exporting ? "Preparando PNG..." : "Baixar arte PNG"}
            </Button>
          </div>
          <div ref={measureRef} className="w-full min-w-0 overflow-hidden rounded-2xl border border-blue-500/20 bg-[#020817] p-2">
            <div className="relative mx-auto" style={{ width: maxWidth, height: sizes.height * scale }}>
              <div style={{ width: sizes.width, height: sizes.height,
                transform: `scale(${scale})`, transformOrigin: "top left" }}>
                <div ref={artRef}>
                  <FootballArt
                    kind={mode} match={featured} matches={visibleMatches}
                    format={format} day={date} headline={effectiveHeadline}
                    brand={brand} logo={logo} stadium={aiBackground}
                    badgeImages={rightsConfirmed ? badgeImages : {}}
                    photo={playerPhoto} playerName={athlete?.name || ""}
                  />
                </div>
              </div>
            </div>
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
            Datas e horários devem ser verificados na programação oficial antes de divulgação. O limite gratuito pode omitir confrontos. Os jogos exibidos vêm da API, não de exemplos fictícios.
          </p>
        </Card>
        <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-muted-foreground">
          <ShieldCheck className="h-5 w-5 shrink-0 text-blue-400" />
          Esta funcionalidade é uma área experimental exclusiva do administrador. Não há publicação automática, nem acesso no menu dos revendedores.
        </div>
      </div>
    </div>
  </div>;
}
