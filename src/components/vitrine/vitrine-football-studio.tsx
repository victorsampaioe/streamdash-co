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
const DEFAULT_LEAGUES = [
  "brazilian-serie-a", "brazilian-serie-b", "conmebol-copa-libertadores",
  "spanish-la-liga", "english-premier-league", "uefa-champions-league",
  "uefa-nations-league", "international-friendly",
];
const LEAGUES = [
  {id:"brazilian-serie-a",name:"🇧🇷 Série A"},{id:"brazilian-serie-b",name:"🇧🇷 Série B"},
  {id:"brazilian-cup",name:"🇧🇷 Copa do Brasil"},
  {id:"conmebol-copa-libertadores",name:"🏆 Libertadores"},
  {id:"conmebol-copa-sudamericana",name:"🏆 Sul-Americana"},
  {id:"spanish-la-liga",name:"🇪🇸 La Liga"},
  {id:"english-premier-league",name:"🏴 Premier League"},
  {id:"uefa-champions-league",name:"⭐ Champions League"},
  {id:"uefa-europa-league",name:"🏆 Europa League"},
  {id:"italian-serie-a",name:"🇮🇹 Serie A"},
  {id:"bundesliga",name:"🇩🇪 Bundesliga"},
  {id:"french-ligue-1",name:"🇫🇷 Ligue 1"},
  {id:"portuguese-primera-liga",name:"🇵🇹 Liga Portugal"},
  {id:"uefa-nations-league",name:"🌍 Nations League"},
  {id:"international-friendly",name:"🌍 Amistosos"},
  {id:"fifa-world-cup",name:"🌎 Copa do Mundo"},
];
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
function FixtureCard({ m, badges, rowHeight }: {
  m: FootballMatch; badges: Record<string, string>; rowHeight: number;
}) {
  return <div className="relative isolate flex items-center justify-between gap-4 overflow-hidden rounded-[23px] border border-white/15 bg-[#071831]/90 px-7 shadow-[0_16px_45px_rgba(0,0,0,.22)] backdrop-blur-xl"
    style={{ height: rowHeight }}>
    <div className="absolute inset-y-0 left-0 w-[7px] bg-gradient-to-b from-sky-300 to-blue-700" />
    <div className="flex min-w-0 flex-1 items-center gap-5">
      <TeamIdentity name={m.home} badge={badges[m.homeBadge]} size={82} />
      <div className="min-w-0 text-left text-[23px] font-[900] uppercase leading-[1.05] tracking-[-0.03em] text-white"
        style={{ textShadow: "0 2px 20px #0007" }}>{m.home}</div>
    </div>
    <div className="flex w-[180px] shrink-0 flex-col items-center justify-center gap-1 text-center">
      <span className="text-[42px] font-black leading-none text-[#7ed8ff]">{m.time}</span>
      <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-extrabold uppercase tracking-[0.06em] text-slate-300">{m.league}</span>
      <span className="text-[13px] font-black uppercase tracking-[0.2em] text-white/40">CONFRONTO</span>
    </div>
    <div className="flex min-w-0 flex-1 items-center justify-end gap-5">
      <div className="min-w-0 text-right text-[23px] font-[900] uppercase leading-[1.05] tracking-[-0.03em] text-white"
        style={{ textShadow: "0 2px 20px #0007" }}>{m.away}</div>
      <TeamIdentity name={m.away} badge={badges[m.awayBadge]} size={82} />
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
  const maxGames = landscape ? 2 : story ? 7 : 4;
  const list = matches.slice(0, maxGames);
  const rowHeight = landscape ? 134 : story ? 175 : 148;
  const listTop = landscape ? 275 : story ? 430 : 370;
  const headlineSize = landscape ? 68 : story ? 111 : 96;
  const heroTop = landscape ? 138 : story ? 221 : 184;
  const safeBrand = brand || "STREAM MONITOR";
  const firstWord = kind === "today" ? "JOGOS" : "HOJE TEM";
  const secondWord = kind === "today" ? "DE HOJE" : "JOGAÇO";
  return <div className="relative isolate overflow-hidden bg-[#030c20] font-sans text-white"
    style={{ width: dims.width, height: dims.height }}>
    {stadium ? <img alt="" src={stadium} className="absolute inset-0 h-full w-full object-cover opacity-[.62]" /> : <>
      <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 70% 38%, #164c84 0%, #0b254d 38%, #030c20 78%)" }} />
      <div className="absolute -right-[120px] -top-[200px] h-[750px] w-[750px] rounded-full border-[90px] border-[#3295fe]/[.12] blur-xl" />
      <div className="absolute -bottom-32 left-20 h-[350px] w-[900px] rounded-[50%] bg-[#127be5]/[.15] blur-[95px]" />
    </>}
    <div className="absolute inset-0 bg-gradient-to-b from-[#020a1b]/90 via-[#04132b]/25 to-[#010a1c]/95" />
    <div className="absolute inset-x-0 top-0 h-[11px] bg-gradient-to-r from-[#0043d6] via-[#71d7ff] to-[#0053cc]" />
    <div className="absolute left-0 top-0 h-full w-2 bg-[#4cb5ff]/30" />
    <div className="absolute left-[60px] right-[60px] top-[55px] flex h-[90px] items-center justify-between border-b border-white/20 pb-5">
      <div className="flex min-w-0 items-center gap-5">
        {logo ? <img src={logo} alt="" className="h-[70px] w-[70px] object-contain" /> :
          <div className="flex h-[64px] w-[64px] items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-800 text-[24px] font-black">SM</div>}
        <div className="text-[24px] font-[900] uppercase tracking-[0.11em]">{safeBrand}</div>
      </div>
      <span className="rounded-lg border border-sky-400/40 bg-sky-500/15 px-5 py-3 text-[16px] font-black uppercase tracking-[0.19em] text-sky-200">
        FUTEBOL AO VIVO
      </span>
    </div>

    {kind === "today" ? <>
      <div className="absolute left-[60px] right-[60px]" style={{ top: heroTop }}>
        <p className="mb-2 text-[22px] font-black uppercase tracking-[0.25em] text-sky-300">A PROGRAMAÇÃO DO SEU DIA · {dateDisplay(day)}</p>
        <div className="font-black uppercase tracking-[-0.06em] leading-[.91]"
          style={{ fontSize: headlineSize, textShadow: "0 9px 35px #0008" }}>
          {headline === "JOGOS DE HOJE" ? <><span className="block">JOGOS</span><span className="block text-[#6bcaff]">DE HOJE</span></> : headline}
        </div>
      </div>
      <div className="absolute left-[60px] right-[60px] flex flex-col" style={{ top: listTop, gap: story ? 20 : 13 }}>
        {list.map((m) => <FixtureCard key={m.id} m={m} badges={badgeImages} rowHeight={rowHeight} />)}
        {!list.length && <div className="rounded-3xl border border-white/20 bg-[#0b2041]/80 p-12 text-center text-[30px] font-black">ESCOLHA OS JOGOS PARA MONTAR A ARTE</div>}
      </div>
      <div className="absolute bottom-[106px] left-[60px] right-[60px] h-[2px] bg-gradient-to-r from-blue-400/80 via-blue-300/30 to-transparent" />
    </> : <>
      <div className="absolute left-[60px] right-[60px]" style={{ top: heroTop }}>
        <div className="mb-3 inline-flex rounded-lg border border-sky-300/40 bg-sky-400/15 px-4 py-3 text-[20px] font-black uppercase tracking-[.22em] text-sky-200">
          {match?.league || "JOGO EM DESTAQUE"}
        </div>
        <h2 className="max-w-[960px] font-black uppercase tracking-[-.06em] leading-[.96]"
          style={{ fontSize: landscape ? 85 : story ? 120 : 105, textShadow: "0 10px 35px #000a" }}>
          {headline || "HOJE TEM JOGAÇO"}
        </h2>
      </div>
      {photo ? <div className="absolute inset-y-[18%] left-[-5%] w-[69%] overflow-hidden">
        <img src={photo} alt="" className="h-full w-full object-contain object-bottom"
          style={{
            maskImage: "linear-gradient(to bottom,transparent 0%,black 18%,black 80%,transparent 99%)",
            filter: "drop-shadow(10px 18px 55px rgba(0,0,0,.8))",
          }} />
      </div> : <>
        <div className="absolute bottom-[21%] left-[-20%] h-[720px] w-[720px] rounded-full border-[65px] border-sky-400/10" />
        <div className="absolute bottom-[20%] left-[7%] rotate-[-15deg] text-[340px] font-black leading-none text-white/[.06]">VS</div>
      </>}
      <div className={`absolute right-[60px] flex ${landscape ? "flex-row items-center gap-3" : "flex-col items-end gap-5"}`}
        style={{ bottom: story ? 465 : landscape ? 234 : 325 }}>
        <div className={`flex items-center rounded-3xl bg-[#061934]/80 backdrop-blur-xl ${landscape ? "gap-3 px-4 py-3" : "gap-5 px-8 py-5"}`}>
          <div className={`text-right font-black uppercase tracking-[-0.035em] ${landscape ? "max-w-[190px] text-[22px]" : "max-w-[320px] text-[35px]"}`}>{match?.home || "Mandante"}</div>
          <TeamIdentity name={match?.home || "Mandante"} badge={match ? badgeImages[match.homeBadge] : undefined} size={landscape ? 72 : 117} />
        </div>
        <div className={`font-black italic leading-none text-sky-300 ${landscape ? "text-[42px]" : "pr-12 text-[65px]"}`}>VS</div>
        <div className={`flex items-center rounded-3xl bg-[#061934]/80 backdrop-blur-xl ${landscape ? "gap-3 px-4 py-3" : "gap-5 px-8 py-5"}`}>
          <div className={`text-right font-black uppercase tracking-[-0.035em] ${landscape ? "max-w-[190px] text-[22px]" : "max-w-[320px] text-[35px]"}`}>{match?.away || "Visitante"}</div>
          <TeamIdentity name={match?.away || "Visitante"} badge={match ? badgeImages[match.awayBadge] : undefined} size={landscape ? 72 : 117} />
        </div>
      </div>
      <div className="absolute left-[60px] right-[60px] flex items-end justify-between border-t-2 border-white/20 pt-6"
        style={{ bottom: story ? 150 : landscape ? 92 : 145 }}>
        <div>
          <div className="text-[19px] font-black uppercase tracking-[.2em] text-sky-300">{dateDisplay(day)}</div>
          {playerName && photo && <div className="mt-3 max-w-[430px] text-[27px] font-black uppercase tracking-wide">{playerName}</div>}
        </div>
        <div className="text-right">
          <div className={`font-black leading-none tracking-tight text-white ${landscape ? "text-[55px]" : "text-[70px]"}`}>{match?.time || "--:--"}</div>
          <span className="text-[17px] font-bold tracking-[.2em] text-white/60">HORÁRIO DE BRASÍLIA</span>
        </div>
      </div>
    </>}
    <div className="absolute inset-x-0 bottom-0 flex h-[77px] items-center justify-between border-t border-white/10 bg-[#020816]/90 px-[60px] text-[15px] font-bold uppercase tracking-[.13em] text-white/55">
      <span>STREAM MONITOR · VITRINE FUTEBOL</span>
      <span>DADOS: SPORTscore · {dateDisplay(day)}</span>
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
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>(DEFAULT_LEAGUES);
  const [playerSearch, setPlayerSearch] = useState("");
  const [debouncedPlayerSearch, setDebouncedPlayerSearch] = useState("");
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
    queryKey: ["admin-football-games", date, selectedLeagues],
    enabled: selectedLeagues.length > 0,
    queryFn: () => fetchGames({ data: { date, leagues: selectedLeagues } }),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const fixtures = useMemo(() => games.data?.matches ?? [], [games.data]);
  const featured = fixtures.find((m) => m.id === featuredId) ?? fixtures[0] ?? null;
  const visibleMatches = useMemo(() =>
    selectedIds.length ? fixtures.filter((m) => selectedIds.includes(m.id)) : fixtures.slice(0, 5),
    [fixtures, selectedIds]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPlayerSearch(playerSearch.trim()), 400);
    return () => clearTimeout(timer);
  }, [playerSearch]);
  const players = useQuery({
    queryKey: ["admin-football-players", debouncedPlayerSearch],
    enabled: mode === "featured" && debouncedPlayerSearch.length >= 2,
    queryFn: () => fetchPlayers({ data: { query: debouncedPlayerSearch } }),
    staleTime: 10 * 60_000,
    retry: 0,
  });
  const athleteList = players.data?.players ?? [];
  const athlete = athleteList.find((x) => x.id === playerId) ?? null;

  useEffect(() => {
    setFeaturedId("");
    setSelectedIds([]);
    setAiBackground("");
  }, [date, selectedLeagues]);
  useEffect(() => {
    setPlayerId("");
    setPlayerUpload("");
    setPlayerRemote("");
    setPlayerSearch("");
  }, [featured?.id, playerSide]);
  useEffect(() => {
    if (playerId || !athleteList.length) return;
    // The first API result is a suggestion, NOT a verified starting player or star.
    const preferred = athleteList.find((p) => p.image) ?? athleteList[0];
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
    const matches = mode === "today" ? visibleMatches.slice(0, format === "landscape" ? 2 : format === "story" ? 7 : 4) : featured ? [featured] : [];
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
    if (!rightsConfirmed || !athlete?.image || mode !== "featured" || playerUpload) return;
    let disposed = false;
    void fetchImage({ data: { url: athlete.image, rightsConfirmed: true } })
      .then((v) => { if (!disposed) setPlayerRemote(v.dataUrl); })
      .catch(() => { if (!disposed) setPlayerRemote(""); });
    return () => { disposed = true; };
  }, [rightsConfirmed, athlete?.image, playerUpload, mode, fetchImage]);

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
        <div className="rounded-2xl border border-white/20 bg-white/10 px-5 py-4 text-sm text-slate-200">Fuso dos jogos: <strong>Fortaleza / Brasília</strong><br />Fonte: <strong>SportScore</strong></div>
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
          <div className="space-y-3 rounded-xl border border-blue-500/15 bg-blue-500/5 p-3">
            <div className="flex items-center justify-between">
              <strong className="text-sm">Campeonatos</strong>
              <Button variant="ghost" size="sm" onClick={() => setSelectedLeagues(LEAGUES.map((l) => l.id))}>Todos</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {LEAGUES.map((league) => <button key={league.id} type="button"
                aria-pressed={selectedLeagues.includes(league.id)}
                onClick={() => setSelectedLeagues((old) => old.includes(league.id) ? old.filter((id) => id !== league.id) : [...old, league.id])}
                className={`rounded-full border px-3 py-2 text-xs font-bold transition-colors ${selectedLeagues.includes(league.id) ? "border-sky-500 bg-blue-600 text-white" : "border-border bg-background text-muted-foreground hover:border-blue-500/60"}`}>
                {league.name}
              </button>)}
            </div>
            {!selectedLeagues.length && <p className="text-xs text-amber-400">Selecione pelo menos um campeonato.</p>}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">Partidas encontradas: {fixtures.length}</span>
            <Button variant="outline" size="sm" onClick={() => void games.refetch()} disabled={games.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${games.isFetching ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
          {games.isLoading && <p className="text-sm text-muted-foreground">Consultando a programação esportiva…</p>}
          {games.isError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">Não foi possível consultar os jogos. Verifique a conexão e tente novamente.</p>}
          {!!games.data && <p className="rounded-lg border border-blue-500/15 bg-blue-500/5 p-3 text-xs leading-5 text-muted-foreground">
            Agenda: {games.data.sourcesSucceeded}/{games.data.sourcesTotal} consultas concluídas.
            {games.data.partial ? " Algumas consultas falharam; tente atualizar. " : " "}
            Confira horários antes de publicar. Dados de <a href="https://sportscore.com/" rel="dofollow" target="_blank" className="font-semibold text-sky-500 underline">SportScore</a>.
          </p>
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
          <p className="text-xs text-muted-foreground">Pesquise o jogador principal pelo nome. O resultado pode incluir atletas de outros clubes; confirme identidade, time e direitos da foto antes de publicar.</p>
          <Input value={playerSearch} onChange={(e) => setPlayerSearch(e.target.value)} placeholder="Ex.: Vini Jr, Arrascaeta, Neymar" maxLength={70} />
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
            <option value="">Escolha o jogador</option>
            {athleteList.map((p: FootballPlayer) => <option value={p.id} key={p.id}>
              {p.name}{p.position ? ` · ${p.position}` : ""}{p.image ? " · possui imagem" : ""}
            </option>)}
          </select>
          {players.isLoading && <p className="text-xs text-muted-foreground">Buscando jogadores…</p>}
          {athlete?.image && <p className="text-xs text-amber-500">Há foto na fonte, mas a licença comercial e o direito de imagem não são garantidos. Confirme os direitos antes de usar.</p>}
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
            <span>Confirmo ter autorização para usar as fotos e escudos selecionados, inclusive para divulgação comercial. Dados de SportScore não concedem direitos sobre fotos de jogadores ou marcas dos clubes. Sem esta confirmação, o estúdio usa nomes e cenário original.</span>
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
            Confira horários oficiais antes de divulgar. Jogos, times e escudos são carregados da fonte, sem partidas inventadas. <a href="https://sportscore.com/" rel="dofollow" target="_blank" className="underline text-sky-500">Powered by SportScore</a>.
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
