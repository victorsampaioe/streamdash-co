import type { FootballMatch } from "@/lib/vitrine-football.functions";
import { formatBrazilianWhatsApp } from "@/lib/vitrine-football-phone";
import { footballBackgroundStyle } from "@/lib/vitrine-football-color";


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
  feed: { width: 1080, height: 1080, left: 48, rowWidth: 984, top: 320, rowHeight: 135, gap: 14, count: 4 },
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
  return <img src={src} alt="" data-football-export-image="crest" referrerPolicy="no-referrer"
    onError={event=>{event.currentTarget.style.display="none";}}
    style={{width:size,height:size,objectFit:"contain",flexShrink:0,filter:"drop-shadow(0 2px 3px rgba(0,0,0,.15))"}} />;
}
function FixtureRibbon({ match, badgeImages, broadcast, accent, width, height }: {
  match: FootballMatch;
  badgeImages: Record<string,string>;
  broadcast: string;
  accent: string;
  width: number;
  height: number;
}) {
  const homeBadge=badgeImages[`home:${match.id}`] || badgeImages[match.homeBadge];
  const awayBadge=badgeImages[`away:${match.id}`] || badgeImages[match.awayBadge];
  const short=height<=160;
  // The primary pill always displays scheduled kickoff, even after the game ends.
  const kickoffTime=/^\d{2}:\d{2}$/.test(match.time||"")?match.time:"Horário indisponível";
  const teamFont=(name:string)=>{
    const length=name.length;
    return short?(length>28?16:length>18?19:23):(length>32?20:length>23?25:30);
  };
  return <div className="relative bg-white" style={{
    width,height,flexShrink:0,border:`3px solid ${accent}`,borderRadius:short?23:35,
    color:"#17223b",boxShadow:"0 9px 20px rgba(0,0,0,.23)",overflow:"hidden",
  }}>
    <div className="absolute inset-x-0 top-0" style={{height:"66%",background:"linear-gradient(175deg,#fff,#f4f7ff)"}}/>
    <div className="absolute font-black uppercase" style={{
      top:short?6:12,left:24,right:24,fontSize:short?12:15,color:"#5c6880",
      lineHeight:1.1,textAlign:"center",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"
    }}>{match.league||"FUTEBOL"}</div>
    <div className="absolute flex items-center" style={{left:18,right:18,top:short?29:40,height:short?58:100,justifyContent:"space-between"}}>
      <div className="flex min-w-0 items-center justify-start" style={{width:"45%",gap:11}}>
        <TeamCrest src={homeBadge} size={short?49:75}/>
        <span style={{fontSize:teamFont(match.home),fontWeight:900,lineHeight:1.05,overflowWrap:"anywhere",
          display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{match.home}</span>
      </div>
      <span style={{fontWeight:1000,color:accent,fontSize:short?19:28,padding:"0 6px"}}>X</span>
      <div className="flex min-w-0 items-center justify-end" style={{width:"45%",gap:11,textAlign:"right"}}>
        <span style={{fontSize:teamFont(match.away),fontWeight:900,lineHeight:1.05,overflowWrap:"anywhere",
          display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{match.away}</span>
        <TeamCrest src={awayBadge} size={short?49:75}/>
      </div>
    </div>
    <div className="absolute flex items-center justify-center" style={{
      left:0,right:"38%",bottom:0,height:short?37:51,
      borderTop:"1px solid #d9deeb",background:"#f1f5fa",padding:"0 12px",
      fontSize:short?13:16,fontWeight:850,color:"#263349"
    }}><span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
      {broadcast.trim()||"Sem transmissão"}
    </span></div>
    <div className="absolute flex items-center justify-center text-white" style={{
      right:0,bottom:0,width:"38%",height:short?37:51,
      background:`linear-gradient(115deg,${darken(accent,.55)},${accent})`,
      borderTopLeftRadius:short?16:25,fontWeight:1000,
      fontSize:short?23:29,textShadow:"0 1px 3px #0005"
    }}>{kickoffTime}</div>
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
  const photoTint=footballBackgroundStyle(accent);
  const story = format === "story";
  const landscape = format === "landscape";
  const branding = brand.trim() || "SUA MARCA";
  const phone = formatBrazilianWhatsApp(contact);
  const heading = headline.trim() || (kind === "featured" ? "JOGAÇO DO DIA" : "JOGOS DO DIA");
  const standardHeading = ["JOGOS DO DIA", "JOGOS DE HOJE", "EVENTOS DE HOJE"].includes(heading.toUpperCase());
  const headingFont = landscape ? 68 : story ? 98 : 72;
  const cardWidth = landscape ? 790 : d.rowWidth;
  const playerWidth = landscape ? 560 : story ? 700 : 620;
  const footerBottom = story ? 79 : landscape ? 38 : 48;
  const hasPlayer = Boolean(playerPhoto);

  const posterCardWidth = format==="feed" ? 984 : cardWidth;
  const posterCardLeft = format==="feed" ? 48 : d.left;
  const rowHeight = format==="feed" && shown.length===1 ? 210 : d.rowHeight;

  return <div className="relative isolate overflow-hidden font-sans" style={{
    width: d.width, height: d.height,
    background: `radial-gradient(ellipse at 88% 30%,${accent} 0%,${dark2} 31%,${dark} 73%,#060607 100%)`,
    color: "white",
  }}>
    {/* The user-approved stadium art, bundled locally to render in preview and PNG. */}
    <div data-testid="football-stadium-image" aria-hidden="true" className="absolute inset-0 pointer-events-none"
      style={{
        zIndex:0,
        backgroundImage:"url('/assets/vitrine-futebol-estadio.webp')",
        backgroundRepeat:"no-repeat",
        backgroundPosition:"center center",
        backgroundSize:"cover",
        filter:`hue-rotate(${photoTint.rotate}deg) saturate(${photoTint.saturation})`,
        opacity:.9,
      }}/>
    {/* Adjustable overlay keeps the match cards and branding readable in all colors. */}
    <div className="absolute inset-0 pointer-events-none" style={{
      zIndex:0,
      background:`linear-gradient(180deg,rgba(2,7,22,.55) 0%,${dark}85 28%,${dark}70 66%,rgba(2,6,18,.65) 100%),radial-gradient(circle at 78% 16%,${accent}30,transparent 65%)`,
    }}/>
    {/* Faint reseller watermark, never team shields. Same transparent logo used by the brand. */}
    {logo && <img src={logo} alt="" crossOrigin="anonymous"
      onError={event=>{event.currentTarget.style.display="none";}}
      className="absolute pointer-events-none" style={{
        left:105,top:330,width:870,height:590,
        objectFit:"contain",opacity:.09,zIndex:1,filter:"grayscale(1)"
      }}/>}
    {/* Sports-poster white torn paper edges, not the watermarked reference photo. */}
    <div className="absolute inset-x-0 top-0 h-[44px] bg-[#f7f7f6]" style={{
      clipPath: "polygon(0 0,100% 0,100% 57%,97% 64%,94% 49%,91% 75%,88% 53%,84% 69%,80% 43%,77% 65%,73% 55%,69% 76%,65% 45%,60% 65%,56% 47%,52% 76%,48% 49%,44% 60%,39% 47%,35% 67%,29% 46%,25% 70%,20% 54%,16% 72%,12% 48%,7% 69%,3% 53%,0 72%)",
    }} />
    <div className="absolute inset-x-0 bottom-0 h-[57px] bg-[#f7f7f6]" style={{
      clipPath: "polygon(0 38%,3% 48%,7% 27%,11% 51%,16% 29%,19% 46%,23% 21%,27% 45%,32% 34%,36% 56%,40% 29%,44% 44%,48% 25%,52% 55%,57% 31%,61% 47%,65% 20%,69% 45%,73% 35%,77% 52%,81% 24%,86% 47%,91% 25%,95% 46%,100% 31%,100% 100%,0 100%)",
    }} />
    {playerPhoto && <img src={playerPhoto} alt={playerName || ""}
      onError={event=>{event.currentTarget.style.display="none";}}
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
    <div className="absolute z-[5] flex items-center justify-center" style={{
      left: landscape ? 47 : 45, top: landscape ? 48 : story ? 74 : 69,
      width: landscape ? 235 : 350, height: landscape ? 140 : 163,
      border: "none", borderRadius: 0,
      background: "transparent", padding: 0,
      boxShadow: "none",
    }}>
      {logo && <img src={logo} alt={branding} data-football-export-image="brand" crossOrigin="anonymous" onError={event=>{event.currentTarget.style.display="none";}} style={{width:"100%",height:"100%",objectFit:"contain",objectPosition:"center"}} />}
    </div>
    <div className="absolute" style={{
      left: landscape ? 315 : 430, top: landscape ? 42 : story ? 65 : 65,
      width: landscape ? 690 : 605, maxHeight: story ? 305 : 185,
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
      left: posterCardLeft, top: d.top - (story ? 30 : 14),
      height: story ? 7 : 5, width: posterCardWidth - 6,
      background: accent, boxShadow: "0 0 25px rgba(255,255,255,.22)",
    }} />
    <div className="absolute" style={{
      left: posterCardLeft, top: d.top, display: "flex", flexDirection: "column",
      gap: d.gap, zIndex: 3,
    }}>
      {shown.length
        ? shown.map((match) => <FixtureRibbon key={match.id}
          match={match} badgeImages={badgeImages}
          broadcast={broadcastByMatch[match.id] || ""}
          accent={accent} width={posterCardWidth} height={rowHeight} />)
        : <div className="flex items-center justify-center text-center font-black"
          style={{
            width: cardWidth, height: d.rowHeight * 2,
            borderRadius: 42, background: "rgba(255,255,255,.95)",
            color: "#111", fontSize: 32, padding: 40,
          }}>ESCOLHA JOGOS REAIS PARA MONTAR A ARTE</div>}
    </div>
    {/* Compact WhatsApp contact strip, kept clear of the reseller logo. */}
    {phone && <div className="absolute z-[4] flex items-center" style={{
      left:54,bottom:footerBottom,width:410,height:76,
      borderRadius:22,background:"linear-gradient(112deg,#071f29,#0b3440 58%,#10483d)",
      border:"2px solid rgba(48,231,150,.85)",padding:"0 19px",
      boxShadow:"0 10px 24px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.17)",gap:16
    }}>
      <svg width="46" height="46" viewBox="0 0 32 32" role="img" aria-label="WhatsApp" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0,background:"#13b76f",borderRadius:13,padding:5,boxShadow:"0 3px 8px #0005"}}>
        <path fill="white" d="M16 3C8.82 3 3 8.78 3 15.94c0 2.28.6 4.5 1.72 6.47L3 29l6.77-1.77a13.06 13.06 0 0 0 6.23 1.57c7.18 0 13-5.79 13-12.94S23.18 3 16 3Zm0 23.44c-1.94 0-3.84-.52-5.49-1.5l-.39-.23-4.02 1.05 1.07-3.9-.25-.4a10.47 10.47 0 0 1-1.6-5.52c0-5.84 4.8-10.59 10.7-10.59 5.9 0 10.7 4.75 10.7 10.59S21.9 26.44 16 26.44Zm5.88-7.94c-.32-.16-1.88-.92-2.18-1.02-.29-.11-.5-.16-.71.16-.21.32-.82 1.02-1.22.18-.21-.37-.24-.69-.08-.32.16-1.35.49-2.58-1.57-.95-.84-1.59-1.87-1.77-2.19-.18-.31-.02-.48.14-.64.15-.14.32-.37.48-.55.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.71-1.71-.97-2.34-.26-.61-.52-.52-.72-.53h-.61c-.21 0-.55.08-.84.4-.29.32-1.1 1.07-1.1 2.62s1.13 3.05 1.29 3.26c.16.21 2.23 3.39 5.41 4.75.76.32 1.35.52 1.81.66.76.24 1.46.2 2.01.12.61-.09 1.88-.77 2.14-1.52.26-.75.26-1.39.18-1.53-.08-.13-.29-.21-.61-.37Z"/>
      </svg>
      <div className="flex flex-col min-w-0" style={{lineHeight:1.08}}>
        <span style={{fontSize:13,fontWeight:900,letterSpacing:".11em",color:"#71edb1"}}>FALE PELO WHATSAPP</span>
        <span style={{fontSize:28,fontWeight:1000,whiteSpace:"nowrap",letterSpacing:".01em"}}>{phone}</span>
      </div>
    </div>}
    {/* Brand logo only: never print a placeholder reseller name in artwork. */}
    {logo && <div className="absolute z-[5] flex items-center justify-end" style={{
      right:45,bottom:footerBottom-3,width:350,height:82
    }}><img src={logo} alt="" data-football-export-image="brand" crossOrigin="anonymous" onError={event=>{event.currentTarget.style.display="none";}}
      style={{width:"100%",height:"100%",objectFit:"contain",objectPosition:"right center"}}/></div>}

  </div>;
}
