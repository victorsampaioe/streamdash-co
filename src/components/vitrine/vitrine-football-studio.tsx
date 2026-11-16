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
import { FootballSchedulePoster, FOOTBALL_POSTER_PALETTES } from "@/components/vitrine/football-schedule-poster";
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
async function uploadedDataUrl(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0) {
    throw new Error("Envie imagem PNG, JPG ou WEBP de até 5 MB.");
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo enviado."));
    reader.onload = () => {
      const result = String(reader.result || "");
      if (!result.startsWith("data:image/")) {
        reject(new Error("Formato de arquivo inválido.")); return;
      }
      const image = new Image();
      image.onload = () => {
        if (image.naturalWidth < 1 || image.naturalHeight < 1) reject(new Error("Imagem sem dimensões válidas."));
        else resolve(result);
      };
      image.onerror = () => reject(new Error("Arquivo de imagem corrompido ou incompatível."));
      image.src = result;
    };
    reader.readAsDataURL(file);
  });
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
  const [playerUploadName, setPlayerUploadName] = useState("");
  const [manualBadgeImages, setManualBadgeImages] = useState<Record<string, string>>({});
  const [badgeFailures, setBadgeFailures] = useState<Record<string, string>>({});
  const [badgeLoading, setBadgeLoading] = useState(false);
  const [remotePlayerError, setRemotePlayerError] = useState("");
  const [logo, setLogo] = useState("");
  const [brand, setBrand] = useState("Stream Monitor");
  const [whatsapp, setWhatsapp] = useState("");
  const [accent, setAccent] = useState("#ee1519");
  const [channels, setChannels] = useState<Record<string,string>>({});
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
    selectedIds.length ? fixtures.filter((m) => selectedIds.includes(m.id)) : fixtures.slice(0, 6),
    [fixtures, selectedIds]);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPlayerSearch(playerSearch.trim()), 400);
    return () => clearTimeout(timer);
  }, [playerSearch]);
  const players = useQuery({
    queryKey: ["admin-football-players", debouncedPlayerSearch],
    enabled: debouncedPlayerSearch.length >= 2,
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
    // Changing fixtures does not erase a manually uploaded player photo.
    // Only the remote player suggestion depends on the selected match.
    setPlayerId("");
    setPlayerRemote("");
    setRemotePlayerError("");
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
    const matches = mode === "today" ? visibleMatches.slice(0, format === "landscape" ? 2 : format === "story" ? 6 : 4) : featured ? [featured] : [];
    return [...new Set(matches.flatMap((m) => [m.homeBadge, m.awayBadge]).filter(Boolean))];
  }, [mode, visibleMatches, featured, format]);

  useEffect(() => {
    if (!rightsConfirmed || !usedBadges.length) {
      setBadgeImages({});
      setBadgeFailures({});
      setBadgeLoading(false);
      return;
    }
    let disposed = false;
    setBadgeLoading(true);
    void (async () => {
      const results = await Promise.all(usedBadges.map(async (url) => {
        try {
          const response = await fetchImage({ data: { url, rightsConfirmed: true } });
          return { url, src: response.dataUrl, error: "" };
        } catch (error) {
          return { url, src: "", error: error instanceof Error ? error.message : "Imagem indisponível" };
        }
      }));
      if (!disposed) {
        setBadgeImages(Object.fromEntries(results.map((x) => [x.url, x.src])));
        setBadgeFailures(Object.fromEntries(results.filter((x) => x.error).map((x) => [x.url, x.error])));
        setBadgeLoading(false);
      }
    })();
    return () => { disposed = true; };
  }, [rightsConfirmed, usedBadges, fetchImage]);

  useEffect(() => {
    setPlayerRemote("");
    setRemotePlayerError("");
    if (!rightsConfirmed || !athlete?.image || playerUpload) return;
    let disposed = false;
    void fetchImage({ data: { url: athlete.image, rightsConfirmed: true } })
      .then((v) => { if (!disposed) setPlayerRemote(v.dataUrl); })
      .catch((error) => {
        if (!disposed) {
          setPlayerRemote("");
          setRemotePlayerError(error instanceof Error ? error.message : "Foto remota indisponível.");
        }
      });
    return () => { disposed = true; };
  }, [rightsConfirmed, athlete?.image, playerUpload, fetchImage]);

  // Manually supplied artwork must be previewed immediately; rights consent
  // only gates third-party images fetched automatically from the provider.
  const playerPhoto = playerUpload || (rightsConfirmed ? playerRemote : "");
  const appliedBadges = { ...badgeImages, ...manualBadgeImages };
  const badgeUrlCount = usedBadges.length;
  const badgeOkCount = usedBadges.filter((url) => !!badgeImages[url]).length;
  const effectiveHeadline = headline.trim() || (mode === "today" ? "JOGOS DO DIA" : "JOGAÇO DO DIA");

  async function onFile(file: File | undefined, type: "logo" | "player") {
    if (!file) return;
    try {
      const dataUrl = await uploadedDataUrl(file);
      if (type === "logo") {
        setLogo(dataUrl);
        toast.success("Logo aplicada à prévia.");
      } else {
        setPlayerUpload(dataUrl);
        setPlayerUploadName(file.name);
        toast.success("Foto do jogador aplicada à prévia.");
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Imagem inválida."); }
  }

  async function onTeamBadge(file: File | undefined, key: string, teamName: string) {
    if (!file) return;
    try {
      const dataUrl = await uploadedDataUrl(file);
      setManualBadgeImages((current) => ({ ...current, [key]: dataUrl }));
      toast.success(`Escudo de ${teamName} aplicado.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o escudo.");
    }
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
          overview: "An original cinematic packed football stadium at dusk under floodlights, dramatic clouds, realistic green pitch and anonymous unrecognizable crowd. Dramatic lighting color: " + accent + ". No recognizable players or faces, team symbols, signage, trademarks or writing.",
          genre: "football, sport, original stadium, matchday, dynamic colorful cinematic atmosphere",
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
        backgroundColor: accent,
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
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Novo visual de cartaz esportivo: agenda em cartões brancos, jogador grande, sua marca, WhatsApp e 6 cores de fundo. Partidas reais e download PNG, sem divulgação automática.</p>
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
          </p>}
          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {fixtures.map((m) => {
              const checked = mode === "featured" ? featured?.id === m.id : (selectedIds.length ? selectedIds.includes(m.id) : fixtures.slice(0, 6).some((v) => v.id === m.id));
              return <button key={m.id} type="button"
                onClick={() => {
                  if (mode === "featured") setFeaturedId(m.id);
                  else {
                    const defaults = selectedIds.length ? selectedIds : fixtures.slice(0, 6).map((v) => v.id);
                    setSelectedIds(checked ? defaults.filter((id) => id !== m.id) : [...defaults, m.id].slice(0, 6));
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

        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-bold">2. Foto do jogador (opcional)</h2>
          <p className="text-xs text-muted-foreground">No novo design, o jogador aparece grande à direita, inclusive na agenda Jogos do Dia. Escolha uma imagem com fundo transparente para o melhor resultado.</p>
          {mode === "featured" && <div className="flex gap-3">
            <Button variant={playerSide === "home" ? "default" : "outline"} className="flex-1" onClick={() => setPlayerSide("home")}>{featured?.home || "Mandante"}</Button>
            <Button variant={playerSide === "away" ? "default" : "outline"} className="flex-1" onClick={() => setPlayerSide("away")}>{featured?.away || "Visitante"}</Button>
          </div>}
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
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="text-lg font-bold">3. Personalize a arte de futebol</h2>
          <label className="block text-sm font-semibold">Formato
            <select value={format} onChange={(e) => { setFormat(e.target.value as Format); setAiBackground(""); }}
              className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3">
              {Object.entries(DIMENSIONS).map(([value, props]) => <option key={value} value={value}>{props.title}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">Chamada principal
            <Input className="mt-2" maxLength={50} placeholder={mode === "today" ? "Jogos do Dia" : "Jogaço do Dia!"} value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </label>
          <label className="block text-sm font-semibold">Marca
            <Input className="mt-2" maxLength={36} value={brand} onChange={(e) => setBrand(e.target.value)} />
          </label>
          <label className="block text-sm font-semibold">WhatsApp do revendedor (opcional)
            <Input className="mt-2" type="tel" maxLength={25} placeholder="(85) 99999-9999"
              value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
          </label>
          <div className="space-y-3 rounded-xl border border-red-500/15 bg-muted/20 p-3">
            <div>
              <strong className="text-sm">Cor de fundo do cartaz</strong>
              <p className="mt-1 text-xs text-muted-foreground">Modelo vermelho como referência, com outras cores personalizáveis. O texto e os cartões continuam legíveis.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {FOOTBALL_POSTER_PALETTES.map((palette) => <button
                key={palette.id} type="button" aria-label={palette.label}
                aria-pressed={accent.toLowerCase() === palette.hex.toLowerCase()}
                title={palette.label}
                onClick={() => setAccent(palette.hex)}
                className={`flex h-12 items-center justify-center rounded-xl border-2 transition-transform hover:scale-[1.03] ${accent.toLowerCase() === palette.hex.toLowerCase() ? "border-white ring-2 ring-blue-500" : "border-border"}`}
                style={{ background: `linear-gradient(135deg,${palette.hex},#080b16)` }}>
                {accent.toLowerCase() === palette.hex.toLowerCase() && <Check className="h-6 w-6 text-white drop-shadow" />}
              </button>)}
            </div>
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input type="color" aria-label="Escolher cor personalizada"
                className="h-11 w-14 cursor-pointer rounded border border-border bg-transparent"
                value={accent} onChange={(e) => setAccent(e.target.value)} />
              Escolher outra cor
              <span className="ml-auto font-mono text-xs text-muted-foreground">{accent}</span>
            </label>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <strong className="text-sm">Emissoras / Onde assistir (opcional)</strong>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Informe somente canais cuja transmissão você confirmou. Não inventamos canais nem exibimos uma emissora sem sua indicação.
            </p>
            <div className="mt-3 max-h-[260px] space-y-3 overflow-y-auto">
              {(mode === "today" ? visibleMatches.slice(0, format === "landscape" ? 2 : format === "story" ? 6 : 4) : featured ? [featured] : []).map((m) => <label key={m.id} className="block text-xs font-semibold">
                <span className="mb-1 block truncate">{m.home} × {m.away}</span>
                <Input placeholder="Ex.: canal oficial confirmado"
                  maxLength={40} value={channels[m.id] || ""}
                  onChange={(e) => setChannels((current) => ({ ...current, [m.id]: e.target.value }))} />
              </label>)}
            </div>
          </div>
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
              <p className="text-sm text-muted-foreground">Visual de cartaz esportivo com jogador, cartões brancos, cores e marca. Confira as informações antes de publicar.</p>
            </div>
            <Button onClick={() => void download()} disabled={exporting || games.isLoading || !fixtures.length} className="h-11">
              <Download className="mr-2 h-4 w-4" /> {exporting ? "Preparando PNG..." : "Baixar arte PNG"}
            </Button>
          </div>
          <div ref={measureRef} className="w-full min-w-0 overflow-hidden rounded-2xl border border-red-500/20 bg-[#090b12] p-2">
            <div className="relative mx-auto" style={{ width: maxWidth, height: sizes.height * scale }}>
              <div style={{ width: sizes.width, height: sizes.height,
                transform: `scale(${scale})`, transformOrigin: "top left" }}>
                <div ref={artRef}>
                  <FootballSchedulePoster
                    kind={mode} matches={mode === "today" ? visibleMatches : featured ? [featured] : []}
                    format={format} day={date} headline={effectiveHeadline}
                    brand={brand} logo={logo} contact={whatsapp}
                    stadium={aiBackground} accent={accent}
                    broadcastByMatch={channels}
                    badgeImages={appliedBadges}
                    playerPhoto={playerPhoto} playerName={athlete?.name || ""}
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
