// Renderizador da "Arte de Novidades" em canvas (client-only) — template premium.
import bgAsset from "@/assets/art-bg-premium.jpg.asset.json";

export type ArtData = {
  serverName: string;
  movies: string[];
  series: string[];
  channels: string[];
  total: number;
  updatedAt: string; // ISO
};

export const ART_W = 1080;
export const ART_H = 1350;

let bgPromise: Promise<HTMLImageElement> | null = null;
function loadBg() {
  if (!bgPromise) {
    bgPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Falha ao carregar o fundo da arte"));
      img.src = bgAsset.url;
    });
  }
  return bgPromise;
}

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const f = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function clip(ctx: CanvasRenderingContext2D, text: string, max: number) {
  let t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (ctx.measureText(t).width <= max) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

/** Quebra em no máximo 2 linhas, com reticências na última. */
function wrap2(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const words = String(text ?? "").replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= max) { cur = next; continue; }
    if (cur) lines.push(cur);
    cur = w;
    if (lines.length === 1) break;
  }
  if (lines.length < 2 && cur) lines.push(cur);
  if (lines.length === 2) {
    const restIdx = words.join(" ").indexOf(lines[1]!) + lines[1]!.length;
    const rest = words.join(" ").slice(restIdx).trim();
    if (rest) lines[1] = clip(ctx, `${lines[1]} ${rest}`, max);
  }
  return lines.slice(0, 2);
}

function glassPanel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
  color: string, alpha = 0.16,
) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 34;
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, "rgba(255,255,255,0.10)");
  g.addColorStop(0.25, "rgba(10,16,38,0.60)");
  g.addColorStop(1, "rgba(4,8,22,0.74)");
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.fill();
  ctx.restore();
}

/** Título 3D metálico com brilho neon. */
function metalTitle(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, glow: string) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = f(900, size);

  // profundidade 3D
  for (let i = 8; i >= 1; i--) {
    ctx.fillStyle = `rgba(60,20,120,${0.10 + i * 0.02})`;
    ctx.fillText(text, cx + i * 0.8, cy + i * 0.9);
  }

  ctx.shadowColor = glow;
  ctx.shadowBlur = 40;
  const grad = ctx.createLinearGradient(0, cy - size / 2, 0, cy + size / 2);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.45, "#eaf2ff");
  grad.addColorStop(0.55, "#a9bcd8");
  grad.addColorStop(1, "#ffffff");
  ctx.fillStyle = grad;
  ctx.fillText(text, cx, cy);
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(167,139,250,0.65)";
  ctx.strokeText(text, cx, cy);
  ctx.restore();
}

type Col = { title: string; icon: string; items: string[]; color: string; tag: boolean };

function drawColumn(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, col: Col, rows: number,
) {
  glassPanel(ctx, x, y, w, h, 26, col.color);

  // topo colorido
  ctx.save();
  const hg = ctx.createLinearGradient(x, y, x + w, y);
  hg.addColorStop(0, `${col.color}00`);
  hg.addColorStop(0.5, col.color);
  hg.addColorStop(1, `${col.color}00`);
  ctx.fillStyle = hg;
  ctx.fillRect(x + 14, y + 2, w - 28, 4);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.save();
  ctx.shadowColor = col.color;
  ctx.shadowBlur = 18;
  ctx.font = f(800, 30);
  ctx.fillStyle = col.color;
  ctx.fillText(`${col.icon} ${col.title}`, x + w / 2, y + 44);
  ctx.restore();

  ctx.textAlign = "left";
  const padX = 16;
  const rowH = (h - 84) / rows;
  const posterW = 42;
  const posterH = Math.min(58, rowH - 14);

  for (let i = 0; i < rows; i++) {
    const ry = y + 78 + i * rowH;
    const item = col.items[i];

    // moldura do poster / ícone
    ctx.save();
    roundRect(ctx, x + padX, ry + (rowH - posterH) / 2 - 2, posterW, posterH, 8);
    ctx.fillStyle = item ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.035)";
    ctx.fill();
    ctx.strokeStyle = col.color;
    ctx.globalAlpha = item ? 0.55 : 0.22;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    const tx = x + padX + posterW + 12;
    const maxW = w - (padX * 2) - posterW - 12;

    if (!item) {
      ctx.save();
      ctx.fillStyle = "rgba(200,216,255,0.14)";
      roundRect(ctx, tx, ry + rowH / 2 - 10, maxW * 0.9, 8, 4);
      ctx.fill();
      roundRect(ctx, tx, ry + rowH / 2 + 4, maxW * 0.55, 8, 4);
      ctx.fill();
      ctx.restore();
      continue;
    }

    ctx.font = f(600, 19);
    const lines = wrap2(ctx, item, maxW);
    ctx.fillStyle = "rgba(233,241,255,0.95)";
    const baseY = ry + rowH / 2 - (lines.length > 1 ? 14 : 4);
    lines.forEach((ln, k) => ctx.fillText(ln, tx, baseY + k * 22));

    if (col.tag) {
      ctx.save();
      ctx.font = f(800, 13);
      const tagW = ctx.measureText("NOVO").width + 16;
      const tagY = baseY + (lines.length > 1 ? 22 : 0) + 16;
      roundRect(ctx, tx, tagY - 9, tagW, 18, 9);
      ctx.fillStyle = col.color;
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#04060f";
      ctx.fillText("NOVO", tx + 8, tagY + 1);
      ctx.restore();
    }
  }
}

export async function renderArt(data: ArtData): Promise<HTMLCanvasElement> {
  const bg = await loadBg();
  const canvas = document.createElement("canvas");
  canvas.width = ART_W;
  canvas.height = ART_H;
  const ctx = canvas.getContext("2d")!;

  // fundo (cover)
  const scale = Math.max(ART_W / bg.width, ART_H / bg.height);
  const bw = bg.width * scale;
  const bh = bg.height * scale;
  ctx.drawImage(bg, (ART_W - bw) / 2, (ART_H - bh) / 2, bw, bh);

  const veil = ctx.createLinearGradient(0, 0, 0, ART_H);
  veil.addColorStop(0, "rgba(3,6,20,0.80)");
  veil.addColorStop(0.5, "rgba(3,6,20,0.52)");
  veil.addColorStop(1, "rgba(2,4,14,0.88)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, ART_W, ART_H);

  const M = 44;
  const W = ART_W - M * 2;

  // ===== Header
  metalTitle(ctx, "NOVIDADES DO SERVIDOR", ART_W / 2, 104, 58, "#a855f7");

  // card glass com o nome do servidor
  const nameY = 150;
  const nameH = 86;
  glassPanel(ctx, M + 60, nameY, W - 120, nameH, 22, "#8b5cf6", 0.10);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.save();
  ctx.font = f(800, 38);
  ctx.shadowColor = "#22d3ee";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#eaf6ff";
  ctx.fillText(clip(ctx, data.serverName.toUpperCase(), W - 180), ART_W / 2, nameY + nameH / 2);
  ctx.restore();

  // linha neon
  const line = ctx.createLinearGradient(M, 0, ART_W - M, 0);
  line.addColorStop(0, "rgba(34,211,238,0)");
  line.addColorStop(0.5, "rgba(168,85,247,0.95)");
  line.addColorStop(1, "rgba(34,211,238,0)");
  ctx.fillStyle = line;
  ctx.fillRect(M, nameY + nameH + 22, W, 3);

  // ===== Três colunas
  const gap = 18;
  const colW = (W - gap * 2) / 3;
  const colY = nameY + nameH + 52;
  const colH = 880;

  const cols: Col[] = [
    { title: "FILMES", icon: "🎬", items: data.movies ?? [], color: "#38bdf8", tag: true },
    { title: "SÉRIES", icon: "📺", items: data.series ?? [], color: "#a855f7", tag: true },
    { title: "CANAIS", icon: "📡", items: data.channels ?? [], color: "#fbbf24", tag: false },
  ];
  cols.forEach((c, i) => drawColumn(ctx, M + i * (colW + gap), colY, colW, colH, c, 10));

  // ===== Rodapé futurista
  const fY = colY + colH + 26;
  const fH = 110;
  glassPanel(ctx, M, fY, W, fH, 24, "#22d3ee", 0.12);

  ctx.textAlign = "center";
  ctx.save();
  ctx.font = f(900, 44);
  ctx.shadowColor = "#38bdf8";
  ctx.shadowBlur = 26;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`🚀 +${data.total} CONTEÚDOS ADICIONADOS`, ART_W / 2, fY + 40);
  ctx.restore();

  ctx.font = f(500, 24);
  ctx.fillStyle = "rgba(214,229,255,0.82)";
  const d = new Date(data.updatedAt);
  ctx.fillText(
    `📅 ATUALIZADO EM: ${d.toLocaleDateString("pt-BR")} · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
    ART_W / 2,
    fY + 82,
  );

  // ===== Marca
  ctx.save();
  ctx.font = f(900, 34);
  ctx.shadowColor = "#a855f7";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#f4f8ff";
  ctx.fillText("STREAM MONITOR", ART_W / 2, ART_H - 62);
  ctx.restore();

  ctx.font = f(600, 19);
  ctx.fillStyle = "rgba(160,190,235,0.75)";
  ctx.fillText("MONITORE. GERENCIE. EVOLUA.", ART_W / 2, ART_H - 30);

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar PNG"))), "image/png"),
  );
}
