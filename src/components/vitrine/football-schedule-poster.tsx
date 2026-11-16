import type { FootballMatch } from "@/lib/vitrine-football.functions";
import { MessageCircle, ShieldCheck } from "lucide-react";

export type FootballPosterFormat = "feed" | "story" | "landscape";
export type FootballPosterKind = "today" | "featured";

export const FOOTBALL_POSTER_PALETTES = [
  { id: "vermelho", label: "Vermelho clássico", hex: "#ee1519" },
  { id: "azul", label: "Azul elétrico", hex: "#146df2" },
  { id: "roxo", label: "Roxo premium", hex: "#7537ed" },
  { id: "verde", label: "Verde campo", hex: "#0ea56d" },
  { id: "dourado", label: "Dourado", hex: "#c78d11" },
  { id: "grafite", label: "Grafite", hex: "#344257" },
] as const;

type PosterProps = {
  kind: FootballPosterKind;
  format: FootballPosterFormat;
  matches: FootballMatch[];
  day: string;
  headline: string;
  brand: string;
  logo: string;
  contact: string;
  badgeImages: Record<string, string>;
  broadcastByMatch: Record<string, string>;
  playerPhoto: string;
  playerName: string;
  stadium: string;
  accent: string;
};

function darken(hex: string, amount: number) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return "#180b15";
  const channels = [1, 3, 5].map((index) =>
    Math.max(0, Math.round(parseInt(hex.slice(index, index + 2), 16) * amount)));
  return "#" + channels.map((x) => x.toString(16).padStart(2, "0")).join("");
}
const dimensions = {
  feed: { width: 1080, height: 1080, left: 53, rowWidth: 782, top: 322, rowHeight: 139, gap: 13, count: 4 },
  story: { width: 1080, height: 1920, left: 52, rowWidth: 812, top: 498, rowHeight: 188, gap: 18, count: 6 },
  landscape: { width: 1200, height: 675, left: 48, rowWidth: 830, top: 204, rowHeight: 138, gap: 15, count: 2 },
} as const;

function dateLabel(day: string) {
  const value = new Date(day + "T12:00:00-03:00");
  if (Number.isNaN(value.getTime())) return day;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza", weekday: "long", day: "2-digit", month: "long",
  }).format(value).replace("-feira", "").toUpperCase();
}
function shortName(text: string) {
  return text.trim().split(/\s+/).slice(0, 3).map((word) => word[0]).join("").toUpperCase();
}
function TeamCrest({ src, name, size }: { src?: string; name: string; size: number }) {
  return <div className="flex shrink-0 items-center justify-center overflow-hidden rounded-full"
    style={{ height: size, width: size, background: src ? "#fff" : "#ecedf0", border: "2px solid #15171c19" }}>
    {src
      ? <img src={src} alt="" style={{ width: "85%", height: "85%", objectFit: "contain" }} />
      : <span style={{ fontWeight: 1000, fontSize: size * 0.29, color: "#15191d" }}>{shortName(name)}</span>}
  </div>;
}
function FixtureRibbon({ match, badgeImages, broadcast, accent, width, height }: {
  match: FootballMatch;
  badgeImages: Record<string, string>;
  broadcast: string;
  accent: string;
  width: number;
  height: number;
}) {
  const compact = height < 145;
  const clubSize = compact ? 65 : 81;
  const titleSize = compact ? 23 : 29;
  const timeSize = compact ? 30 : 38;
  return <div className="relative overflow-hidden bg-white"
    style={{
      width, height, color: "#11131b", border: `5px solid ${accent}`,
      borderRadius: compact ? 37 : 46,
      boxShadow: "0 12px 5px rgba(0,0,0,.11),0 20px 30px rgba(0,0,0,.32)",
    }}>
    <div className="absolute inset-x-0 top-0" style={{ height: "43%", background: "linear-gradient(180deg,#ffffff,#f6f7f8)" }} />
    <div className="absolute left-[3%] top-[9%] flex items-center justify-center gap-3"
      style={{ width: "41%", height: "59%" }}>
      <TeamCrest name={match.home} src={badgeImages[`home:${match.id}`] || badgeImages[match.homeBadge]} size={clubSize} />
      <span style={{
        fontSize: compact ? 33 : 40, color: "#11141a", fontStyle: "italic",
        fontWeight: 1000, letterSpacing: "-.13em", marginRight: 8,
      }}>VS</span>
      <TeamCrest name={match.away} src={badgeImages[`away:${match.id}`] || badgeImages[match.awayBadge]} size={clubSize} />
    </div>
    <div className="absolute flex flex-col justify-center" style={{
      left: "45.5%", right: 14, top: 8, height: "66%", textAlign: "center",
    }}>
      <div style={{
        fontSize: compact ? 12 : 13, fontWeight: 800, color: "#595b65",
        lineHeight: 1.05, overflow: "hidden", maxHeight: 25,
      }}>{match.league}</div>
      <div style={{
        fontSize: titleSize, fontWeight: 1000, lineHeight: 0.99,
        letterSpacing: "-.035em", textTransform: "uppercase",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>{match.home} X {match.away}</div>
    </div>
    <div className="absolute flex items-center justify-center"
      style={{
        left: "4.5%", bottom: compact ? 8 : 12,
        width: "43%", height: compact ? 30 : 37,
        borderRadius: 30, background: "linear-gradient(180deg,#fff,#e9e9ed)",
        boxShadow: "inset 0 1px 2px #0002,0 3px 4px #0002",
        border: "1px solid #d9dade",
      }}>
      <span style={{
        display: "block", width: "96%", color: "#222734", textAlign: "center",
        fontSize: compact ? 13 : 16, lineHeight: 1,
        fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{broadcast.trim() || "HORÁRIO DE BRASÍLIA"}</span>
    </div>
    <div className="absolute flex items-center justify-center text-white" style={{
      bottom: compact ? 3 : 4, right: 0, width: "46%", height: compact ? 46 : 59,
      background: `linear-gradient(110deg,${darken(accent, .5)},${accent})`,
      borderTopLeftRadius: 26, borderBottomLeftRadius: 25,
      borderTopRightRadius: 0, borderBottomRightRadius: 24,
      fontSize: timeSize, fontWeight: 1000,
      lineHeight: 1, letterSpacing: "-.02em",
      textShadow: "0 3px 8px rgba(0,0,0,.45)",
    }}>{match.time || "A confirmar"}</div>
  </div>;
}

export function FootballSchedulePoster({
  kind, format, matches, day, headline, brand, logo, contact,
  badgeImages, broadcastByMatch, playerPhoto, playerName, stadium, accent,
}: PosterProps) {
  const d = dimensions[format];
  const shown = matches.slice(0, d.count);
  const dark = darken(accent, .24);
  const dark2 = darken(accent, .44);
  const story = format === "story";
  const landscape = format === "landscape";
  const branding = brand.trim() || "SUA MARCA";
  const digits = contact.replace(/\D/g, "").slice(0, 13);
  const phone = digits.length > 0 ? contact.trim().slice(0, 25) : "";
  const heading = headline.trim() || (kind === "featured" ? "JOGAÇO DO DIA" : "JOGOS DO DIA");
  const standardHeading = heading.toUpperCase() === "JOGOS DO DIA" || heading.toUpperCase() === "JOGOS DE HOJE";
  const headingFont = landscape ? 74 : story ? 116 : 93;
  const cardWidth = landscape ? 790 : d.rowWidth;
  const playerWidth = landscape ? 560 : story ? 700 : 620;
  const footerBottom = story ? 79 : landscape ? 38 : 48;

  return <div className="relative isolate overflow-hidden font-sans" style={{
    width: d.width, height: d.height,
    background: `radial-gradient(ellipse at 88% 30%,${accent} 0%,${dark2} 31%,${dark} 73%,#060607 100%)`,
    color: "white",
  }}>
    {/* Animated-looking stadium lighting is static for reliable PNG output. */}
    {stadium && <img src={stadium} alt="" className="absolute inset-0 h-full w-full object-cover"
      style={{ opacity: 0.30, filter: "saturate(1.15) contrast(1.1)" }} />}
    <div className="absolute inset-0" style={{
      background: `linear-gradient(94deg,rgba(0,0,0,.46),transparent 70%),linear-gradient(180deg,transparent 30%,${dark}44 75%,#080609 100%)`,
    }} />
    <div className="absolute -right-20 top-[8%] h-[65%] w-[60%] rounded-full blur-[90px]"
      style={{ background: accent, opacity: .33 }} />
    <div className="absolute inset-0" style={{
      backgroundImage: "repeating-linear-gradient(159deg,transparent 0px,transparent 23px,rgba(255,255,255,.025) 24px,transparent 25px)",
      opacity: .52,
    }} />
    {/* Sports-poster white torn paper edges, not the watermarked reference photo. */}
    <div className="absolute inset-x-0 top-0 h-[44px] bg-[#f7f7f6]" style={{
      clipPath: "polygon(0 0,100% 0,100% 57%,97% 64%,94% 49%,91% 75%,88% 53%,84% 69%,80% 43%,77% 65%,73% 55%,69% 76%,65% 45%,60% 65%,56% 47%,52% 76%,48% 49%,44% 60%,39% 47%,35% 67%,29% 46%,25% 70%,20% 54%,16% 72%,12% 48%,7% 69%,3% 53%,0 72%)",
    }} />
    <div className="absolute inset-x-0 bottom-0 h-[57px] bg-[#f7f7f6]" style={{
      clipPath: "polygon(0 38%,3% 48%,7% 27%,11% 51%,16% 29%,19% 46%,23% 21%,27% 45%,32% 34%,36% 56%,40% 29%,44% 44%,48% 25%,52% 55%,57% 31%,61% 47%,65% 20%,69% 45%,73% 35%,77% 52%,81% 24%,86% 47%,91% 25%,95% 46%,100% 31%,100% 100%,0 100%)",
    }} />
    {playerPhoto && <img src={playerPhoto} alt={playerName || ""}
      className="absolute object-contain object-bottom"
      style={{
        right: landscape ? -22 : -48,
        bottom: landscape ? 18 : story ? 42 : 30,
        width: playerWidth,
        height: story ? 1570 : landscape ? 610 : 920,
        filter: "drop-shadow(-20px 11px 28px rgba(0,0,0,.72))",
        maskImage: "linear-gradient(180deg,transparent 0%,black 9%,black 83%,transparent 99%)",
      }} />}
    <div className="absolute" style={{
      left: landscape ? 47 : 55, top: landscape ? 48 : story ? 74 : 65,
      width: landscape ? 155 : 143, height: landscape ? 115 : 136,
      border: "5px solid white", borderRadius: 22,
      background: `linear-gradient(145deg,#141619,${dark2},#070808)`,
      boxShadow: `0 0 0 5px ${accent},0 14px 18px rgba(0,0,0,.44)`,
      display: "flex", alignItems: "center", flexDirection: "column", justifyContent: "center",
    }}>
      <span style={{ fontSize: landscape ? 38 : 42, lineHeight: 1 }}>⚽</span>
      <span style={{ fontSize: 17, fontWeight: 1000, marginTop: 3, lineHeight: 1.1 }}>VITRINE IA</span>
      <span style={{ fontSize: 23, fontWeight: 1000, lineHeight: 1.1, color: "#ffd85a" }}>FUTEBOL</span>
    </div>
    <div className="absolute" style={{
      left: landscape ? 238 : 237, top: landscape ? 42 : story ? 65 : 65,
      width: landscape ? 760 : 810, maxHeight: story ? 305 : 185,
      textShadow: "0 10px 17px rgba(0,0,0,.32)",
    }}>
      {standardHeading ? <>
        <div style={{
          color: "#ffcf3e", fontSize: headingFont, fontWeight: 1000,
          fontStyle: "italic", lineHeight: .89, letterSpacing: "-.075em",
        }}>JOGOS</div>
        <div style={{
          color: "white", fontSize: headingFont * .77, fontWeight: 1000,
          fontStyle: "italic", lineHeight: 1, letterSpacing: "-.065em",
        }}>DO DIA</div>
      </> : <div style={{
        color: "#fff", fontSize: headingFont * .63, fontWeight: 1000,
        fontStyle: "italic", lineHeight: 1.05, textTransform: "uppercase",
        overflowWrap: "break-word",
      }}>{heading.slice(0, 50)}</div>}
      <div className="inline-block bg-[#fffafa] text-[#101116]" style={{
        fontSize: landscape ? 17 : story ? 30 : 19,
        fontWeight: 1000, marginTop: story ? 13 : 6,
        padding: "6px 22px", transform: "rotate(-1deg)",
        clipPath: "polygon(2% 0,97% 3%,100% 95%,2% 100%,0 15%)",
      }}>{dateLabel(day)}</div>
    </div>
    <div className="absolute" style={{
      left: d.left, top: d.top - (story ? 30 : 14),
      height: story ? 7 : 5, width: cardWidth - 6,
      background: accent, boxShadow: "0 0 25px rgba(255,255,255,.22)",
    }} />
    <div className="absolute" style={{
      left: d.left, top: d.top, display: "flex", flexDirection: "column",
      gap: d.gap, zIndex: 3,
    }}>
      {shown.length
        ? shown.map((match) => <FixtureRibbon key={match.id}
          match={match} badgeImages={badgeImages}
          broadcast={broadcastByMatch[match.id] || ""}
          accent={accent} width={cardWidth} height={d.rowHeight} />)
        : <div className="flex items-center justify-center text-center font-black"
          style={{
            width: cardWidth, height: d.rowHeight * 2,
            borderRadius: 42, background: "rgba(255,255,255,.95)",
            color: "#111", fontSize: 32, padding: 40,
          }}>ESCOLHA JOGOS REAIS PARA MONTAR A ARTE</div>}
    </div>
    <div className="absolute font-bold" style={{
      writingMode: "vertical-rl", transform: "rotate(180deg)",
      left: story ? 17 : 9, top: story ? 525 : landscape ? 225 : 345,
      height: story ? 1040 : landscape ? 260 : 590,
      color: "white", fontSize: story ? 21 : 15,
      opacity: .93, lineHeight: 1,
    }}>HORÁRIOS E TRANSMISSÕES SUJEITOS A ALTERAÇÃO · CONFIRA ANTES DE DIVULGAR</div>
    {/* Contact + reseller branding stay clear of the torn bottom edge. */}
    <div className="absolute z-[4] flex items-center" style={{
      left: story ? 74 : 55, bottom: footerBottom,
      height: story ? 95 : landscape ? 54 : 69,
      maxWidth: landscape ? 590 : 670,
      padding: "0 22px", borderRadius: 99,
      background: phone ? "linear-gradient(100deg,#099a53,#18bb6a)" : `linear-gradient(110deg,${dark2},${accent})`,
      border: "3px solid white",
      boxShadow: "0 6px 12px rgba(0,0,0,.45)",
    }}>
      {phone
        ? <><MessageCircle color="white" size={story ? 52 : landscape ? 31 : 40} strokeWidth={3} />
          <span style={{
            marginLeft: 15, fontWeight: 1000,
            fontSize: story ? 42 : landscape ? 27 : 30,
            whiteSpace: "nowrap", letterSpacing: "-.025em",
          }}>{phone}</span></>
        : <><ShieldCheck size={story ? 42 : 30} color="#fff" />
          <span style={{ marginLeft: 12, fontSize: story ? 29 : 23, fontWeight: 1000 }}>CONSULTE A PROGRAMAÇÃO</span></>}
    </div>
    <div className="absolute z-[4] flex items-center justify-end gap-3" style={{
      right: landscape ? 52 : 44, bottom: footerBottom + (story ? 0 : 2),
      width: landscape ? 350 : story ? 340 : 350,
      height: story ? 91 : landscape ? 52 : 67,
      textAlign: "right",
    }}>
      {logo && <img src={logo} alt="" style={{
        width: story ? 85 : 60, height: story ? 85 : 60, objectFit: "contain",
        filter: "drop-shadow(0 6px 7px rgba(0,0,0,.4))",
      }} />}
      <strong style={{
        color: "#fff", fontSize: story ? 45 : landscape ? 29 : 34,
        fontWeight: 1000, lineHeight: .98, textShadow: "0 7px 14px #000",
        overflowWrap: "anywhere",
      }}>{branding.slice(0, 36)}</strong>
    </div>
    <div className="absolute z-[5] inset-x-0 text-center" style={{
      bottom: story ? 22 : 13, color: "#1d2027", fontSize: story ? 13 : 10,
      fontWeight: 900, letterSpacing: ".16em",
    }}>STREAM MONITOR · VITRINE IA FUTEBOL · DADOS: SPORTScore</div>
  </div>;
}
