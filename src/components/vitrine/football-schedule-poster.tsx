import type { FootballMatch } from "@/lib/vitrine-football.functions";
import { ShieldCheck } from "lucide-react";

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
  playerFit?: "contain" | "cover";
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
  feed: { width: 1080, height: 1080, left: 53, rowWidth: 782, top: 335, rowHeight: 215, gap: 23, count: 2 },
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
function TeamCrest({ src, size }: { src?: string; size: number }) {
  if (!src) return null;
  return <img src={src} alt="" crossOrigin="anonymous"
    style={{width:size,height:size,objectFit:"contain",flexShrink:0,filter:"drop-shadow(0 2px 3px rgba(0,0,0,.15))"}} />;
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
  const clubSize = compact ? 65 : 96;
  const titleSize = compact ? 23 : 34;
  const timeSize = compact ? 30 : 41;
  return <div className="relative overflow-hidden bg-white"
    style={{
      width, height, color: "#11131b", border: `5px solid ${accent}`,
      borderRadius: compact ? 37 : 46,
      boxShadow: "0 12px 5px rgba(0,0,0,.11),0 20px 30px rgba(0,0,0,.32)",
    }}>
    <div className="absolute inset-x-0 top-0" style={{ height: "43%", background: "linear-gradient(180deg,#ffffff,#f6f7f8)" }} />
    <div className="absolute left-[3%] top-[9%] flex items-center justify-center gap-3"
      style={{ width: "41%", height: "59%" }}>
      <TeamCrest src={badgeImages[`home:${match.id}`] || badgeImages[match.homeBadge]} size={clubSize} />
      <span style={{
        fontSize: compact ? 33 : 40, color: "#11141a", fontStyle: "italic",
        fontWeight: 1000, letterSpacing: "-.13em", marginRight: 8,
      }}>VS</span>
      <TeamCrest src={badgeImages[`away:${match.id}`] || badgeImages[match.awayBadge]} size={clubSize} />
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
      }}>{broadcast.trim() || "TRANSMISSÃO NÃO CONFIRMADA"}</span>
    </div>
    <div className="absolute flex items-center justify-center text-white" style={{
      bottom: compact ? 3 : 4, right: 0, width: "46%", height: compact ? 46 : 59,
      background: `linear-gradient(110deg,${darken(accent, .5)},${accent})`,
      borderTopLeftRadius: 26, borderBottomLeftRadius: 25,
      borderTopRightRadius: 0, borderBottomRightRadius: 24,
      fontSize: timeSize, fontWeight: 1000,
      lineHeight: 1, letterSpacing: "-.02em",
      textShadow: "0 3px 8px rgba(0,0,0,.45)",
    }}>{match.scoreLabel ? "FINAL "+match.scoreLabel :
      /ao_vivo|ao vivo|live|em andamento/i.test(match.status||"") ? "AO VIVO · "+(match.time||"") :
      /encerrad|finaliz|finished|concluid|ended/i.test(match.status||"") ? "ENCERRADO" :
      match.time || "A confirmar"}</div>
  </div>;
}

export function FootballSchedulePoster({
  kind, format, matches, day, headline, brand, logo, contact,
  badgeImages, broadcastByMatch, playerPhoto, playerName, playerFit = "contain", stadium, accent,
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
  const standardHeading = ["JOGOS DO DIA", "JOGOS DE HOJE", "EVENTOS DE HOJE"].includes(heading.toUpperCase());
  const headingFont = landscape ? 68 : story ? 98 : 78;
  const cardWidth = landscape ? 790 : d.rowWidth;
  const playerWidth = landscape ? 560 : story ? 700 : 620;
  const footerBottom = story ? 79 : landscape ? 38 : 48;
  const hasPlayer = Boolean(playerPhoto);
  const watermarkBadges = [...new Set(shown.flatMap(m => [badgeImages[m.homeBadge] || m.homeBadge, badgeImages[m.awayBadge] || m.awayBadge]).filter(Boolean))].slice(0,4);
  const offset = !hasPlayer && format === "feed" ? 65 : 0;
  const posterCardWidth = !hasPlayer && format === "feed" ? 974 : cardWidth;
  const posterCardLeft = !hasPlayer && format === "feed" ? 53 : d.left;

  return <div className="relative isolate overflow-hidden font-sans" style={{
    width: d.width, height: d.height,
    background: `radial-gradient(ellipse at 88% 30%,${accent} 0%,${dark2} 31%,${dark} 73%,#060607 100%)`,
    color: "white",
  }}>
    {!hasPlayer && watermarkBadges.length > 0 && <div className="absolute pointer-events-none flex items-center justify-center gap-6"
      style={{top:530,left:60,right:60,height:230,opacity:.09,zIndex:0}}>
      {watermarkBadges.map((badge,i)=><img key={i} src={badge} alt="" crossOrigin="anonymous"
        style={{height:150,width:150,objectFit:"contain"}}/>)}
    </div>}
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
      className="absolute"
      style={{
        right: landscape ? -120 : -155,
        bottom: landscape ? 18 : story ? 42 : 30,
        width: playerWidth,
        height: story ? 1570 : landscape ? 610 : 920,
        objectFit: playerFit,
        objectPosition: "center bottom",
        filter: "drop-shadow(-20px 11px 28px rgba(0,0,0,.72))",
        maskImage: "linear-gradient(180deg,transparent 0%,black 9%,black 83%,transparent 99%)",
      }} />}
    <div className="absolute z-[5] flex items-center justify-center overflow-hidden" style={{
      left: landscape ? 47 : 55, top: landscape ? 48 : story ? 74 : 58,
      width: landscape ? 210 : 225, height: landscape ? 135 : 160,
      border: "none", borderRadius: 0,
      background: "transparent", padding: 0,
      boxShadow: "none",
    }}>
      {logo ? <img src={logo} alt={branding} style={{width:"100%",height:"100%",objectFit:"contain"}} />
        : <span style={{fontSize:24,fontWeight:1000,textAlign:"center"}}>{branding.slice(0,18)}</span>}
    </div>
    <div className="absolute" style={{
      left: landscape ? 315 : 322, top: landscape ? 42 : story ? 65 : 65,
      width: landscape ? 690 : 727, maxHeight: story ? 305 : 185,
      textShadow: "0 10px 17px rgba(0,0,0,.32)",
    }}>
      {standardHeading ? <>
        <div style={{
          color: "#ffcf3e", fontSize: headingFont, fontWeight: 1000,
          fontStyle: "italic", lineHeight: .89, letterSpacing: "-.075em",
        }}>EVENTOS</div>
        <div style={{
          color: "white", fontSize: headingFont * .77, fontWeight: 1000,
          fontStyle: "italic", lineHeight: 1, letterSpacing: "-.065em",
        }}>DE HOJE</div>
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
      left: posterCardLeft, top: d.top + offset - (story ? 30 : 14),
      height: story ? 7 : 5, width: posterCardWidth - 6,
      background: accent, boxShadow: "0 0 25px rgba(255,255,255,.22)",
    }} />
    <div className="absolute" style={{
      left: posterCardLeft, top: d.top + offset, display: "flex", flexDirection: "column",
      gap: d.gap, zIndex: 3,
    }}>
      {shown.length
        ? shown.map((match) => <FixtureRibbon key={match.id}
          match={match} badgeImages={badgeImages}
          broadcast={broadcastByMatch[match.id] || ""}
          accent={accent} width={posterCardWidth} height={d.rowHeight} />)
        : <div className="flex items-center justify-center text-center font-black"
          style={{
            width: cardWidth, height: d.rowHeight * 2,
            borderRadius: 42, background: "rgba(255,255,255,.95)",
            color: "#111", fontSize: 32, padding: 40,
          }}>ESCOLHA JOGOS REAIS PARA MONTAR A ARTE</div>}
    </div>
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
        ? <><svg width={story ? 52 : landscape ? 31 : 40} height={story ? 52 : landscape ? 31 : 40}
             viewBox="0 0 32 32" role="img" aria-label="WhatsApp" xmlns="http://www.w3.org/2000/svg">
            <path fill="white" d="M16 3C8.82 3 3 8.78 3 15.94c0 2.28.6 4.5 1.72 6.47L3 29l6.77-1.77a13.06 13.06 0 0 0 6.23 1.57c7.18 0 13-5.79 13-12.94S23.18 3 16 3Zm0 23.44c-1.94 0-3.84-.52-5.49-1.5l-.39-.23-4.02 1.05 1.07-3.9-.25-.4a10.47 10.47 0 0 1-1.6-5.52c0-5.84 4.8-10.59 10.7-10.59 5.9 0 10.7 4.75 10.7 10.59S21.9 26.44 16 26.44Zm5.88-7.94c-.32-.16-1.88-.92-2.18-1.02-.29-.11-.5-.16-.71.16-.21.32-.82 1.02-1.01 1.22-.18.21-.37.24-.69.08-.32-.16-1.35-.49-2.58-1.57-.95-.84-1.59-1.87-1.77-2.19-.18-.31-.02-.48.14-.64.15-.14.32-.37.48-.55.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.71-1.71-.97-2.34-.26-.61-.52-.52-.72-.53h-.61c-.21 0-.55.08-.84.4-.29.32-1.1 1.07-1.1 2.62s1.13 3.05 1.29 3.26c.16.21 2.23 3.39 5.41 4.75.76.32 1.35.52 1.81.66.76.24 1.46.2 2.01.12.61-.09 1.88-.77 2.14-1.52.26-.75.26-1.39.18-1.53-.08-.13-.29-.21-.61-.37Z"/>
          </svg>
          <span style={{
            marginLeft: 12, fontWeight: 1000,
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
  </div>;
}
