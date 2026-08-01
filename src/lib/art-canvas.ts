// Renderizador da "Arte de Novidades" em canvas (client-only).
import bgAsset from "@/assets/art-bg-cinema.png.asset.json";

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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clip(ctx: CanvasRenderingContext2D, text: string, max: number) {
  let t = text.replace(/\s+/g, " ").trim();
  if (ctx.measureText(t).width <= max) return t;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

function drawSection(
  ctx: CanvasRenderingContext2D,
  opts: { x: number; y: number; w: number; title: string; items: string[]; color: string; rows: number },
) {
  const { x, y, w, title, items, color, rows } = opts;
  const h = 78 + rows * 44;

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  ctx.fillStyle = "rgba(8,14,32,0.72)";
  roundRect(ctx, x, y, w, h, 26);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, x, y, w, h, 26);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.75;
  ctx.stroke();
  ctx.restore();

  // faixa lateral neon
  ctx.save();
  roundRect(ctx, x, y + 20, 6, h - 40, 3);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();

  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.font = "700 34px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText(title, x + 34, y + 44);

  ctx.font = "400 28px system-ui, -apple-system, 'Segoe UI', sans-serif";
  const list = items.slice(0, rows);
  for (let i = 0; i < rows; i++) {
    const label = list[i];
    const ly = y + 92 + i * 44;
    if (!label) {
      ctx.fillStyle = "rgba(220,232,255,0.28)";
      ctx.fillText("—", x + 34, ly);
      continue;
    }
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(x + 42, ly, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(226,236,255,0.92)";
    ctx.fillText(clip(ctx, label, w - 100), x + 62, ly);
  }
  return h;
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

  // véu escuro para legibilidade
  const veil = ctx.createLinearGradient(0, 0, 0, ART_H);
  veil.addColorStop(0, "rgba(3,7,20,0.72)");
  veil.addColorStop(0.5, "rgba(3,7,20,0.58)");
  veil.addColorStop(1, "rgba(3,7,20,0.88)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, ART_W, ART_H);

  const M = 64;
  const W = ART_W - M * 2;

  // header
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.save();
  ctx.shadowColor = "#38bdf8";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#e9f4ff";
  ctx.font = "800 62px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText("🔥 NOVIDADES DO SERVIDOR", ART_W / 2, 118);
  ctx.restore();

  ctx.font = "600 40px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillStyle = "#8b5cf6";
  ctx.save();
  ctx.shadowColor = "#8b5cf6";
  ctx.shadowBlur = 24;
  ctx.fillText(`📺 ${clip(ctx, data.serverName, W)}`, ART_W / 2, 182);
  ctx.restore();

  // linha neon
  const line = ctx.createLinearGradient(M, 0, ART_W - M, 0);
  line.addColorStop(0, "rgba(56,189,248,0)");
  line.addColorStop(0.5, "rgba(56,189,248,0.9)");
  line.addColorStop(1, "rgba(139,92,246,0)");
  ctx.fillStyle = line;
  ctx.fillRect(M, 214, W, 3);

  ctx.textAlign = "left";
  let y = 254;
  y += drawSection(ctx, { x: M, y, w: W, title: "🎬 FILMES NOVOS", items: data.movies, color: "#38bdf8", rows: 6 }) + 24;
  y += drawSection(ctx, { x: M, y, w: W, title: "📺 SÉRIES NOVAS", items: data.series, color: "#a78bfa", rows: 5 }) + 24;
  y += drawSection(ctx, { x: M, y, w: W, title: "📡 CANAIS NOVOS", items: data.channels, color: "#22d3ee", rows: 4 }) + 28;

  // destaque inferior
  const boxH = 128;
  const boxY = Math.min(y, ART_H - boxH - 108);
  ctx.save();
  const g = ctx.createLinearGradient(M, boxY, ART_W - M, boxY + boxH);
  g.addColorStop(0, "rgba(56,189,248,0.22)");
  g.addColorStop(1, "rgba(139,92,246,0.22)");
  ctx.shadowColor = "#38bdf8";
  ctx.shadowBlur = 32;
  roundRect(ctx, M, boxY, W, boxH, 28);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = "#f8fbff";
  ctx.font = "800 46px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillText(`🚀 +${data.total} conteúdos adicionados`, ART_W / 2, boxY + 48);
  ctx.font = "400 26px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(226,236,255,0.8)";
  ctx.fillText(
    `📅 Atualizado em: ${new Date(data.updatedAt).toLocaleString("pt-BR")}`,
    ART_W / 2,
    boxY + 94,
  );

  ctx.font = "600 24px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.fillStyle = "rgba(148,180,225,0.75)";
  ctx.fillText("Powered by Stream Monitor", ART_W / 2, ART_H - 52);

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar PNG"))), "image/png"),
  );
}
