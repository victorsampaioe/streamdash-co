#!/usr/bin/env node
/**
 * Auditoria de armazenamento do projeto.
 * Uso: bun run audit
 *
 * Verifica: tamanho do repositório, dependências não utilizadas,
 * arquivos órfãos, assets duplicados e logs de desenvolvimento.
 * É somente leitura — apenas relata e sugere remoções.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

const sh = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const files = sh("git ls-files").split("\n").filter(Boolean);
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;

// Infra de build: referenciadas por configuração/bundler, nunca importadas em src/
const INFRA = new Set([
  "react-dom",
  "@tailwindcss/vite",
  "@tanstack/router-plugin",
  "vite-tsconfig-paths",
  "tailwindcss",
  "tw-animate-css",
  "@types/qrcode",
]);

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const src = files.filter((f) => /^(src|vite\.config\.ts)/.test(f));
const code = new Map(src.map((f) => [f, readFileSync(f, "utf8")]));
const allCode = [...code.values()].join("\n");

let total = 0;
const bySize = [];
for (const f of files) {
  try {
    const s = statSync(f).size;
    total += s;
    bySize.push([f, s]);
  } catch {
    /* arquivo removido */
  }
}
bySize.sort((a, b) => b[1] - a[1]);

console.log("=== Tamanho do repositório ===");
console.log(`${files.length} arquivos versionados · ${(total / 1024 / 1024).toFixed(2)} MB`);
console.log("Maiores arquivos:");
for (const [f, s] of bySize.slice(0, 10)) console.log(`  ${kb(s).padStart(10)}  ${f}`);

console.log("\n=== Dependências possivelmente não utilizadas ===");
const unused = Object.keys(pkg.dependencies ?? {}).filter(
  (d) => !INFRA.has(d) && !new RegExp(`["'](${d.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")})(/|["'])`).test(allCode),
);
console.log(unused.length ? unused.map((d) => `  bun remove ${d}`).join("\n") : "  Nenhuma 👍");

console.log("\n=== Arquivos órfãos (nenhum import aponta para eles) ===");
const ENTRY = /^src\/(routes\/|router|start|server|styles|styles\.css)/;
const orphans = src.filter((f) => {
  if (ENTRY.test(f) || f === "vite.config.ts" || f.endsWith(".d.ts")) return false;
  const base = f.replace(/^src\//, "").replace(/\.(tsx?|css)$/, "");
  const name = base.split("/").pop();
  return ![...code].some(([o, c]) => o !== f && (c.includes(`@/${base}`) || new RegExp(`["'][./][^"']*${name}["']`).test(c)));
});
console.log(orphans.length ? orphans.map((f) => `  ${f}`).join("\n") : "  Nenhum 👍");

console.log("\n=== Assets duplicados / não referenciados ===");
const assets = files.filter((f) => /\.(png|jpe?g|svg|gif|webp|ico|mp4|woff2?|asset\.json)$/.test(f));
const hashes = new Map();
for (const a of assets) {
  const h = createHash("sha1").update(readFileSync(a)).digest("hex");
  (hashes.get(h) ?? hashes.set(h, []).get(h)).push(a);
}
const dups = [...hashes.values()].filter((g) => g.length > 1);
console.log(dups.length ? dups.map((g) => `  duplicados: ${g.join(", ")}`).join("\n") : "  Nenhum duplicado 👍");
const unrefAssets = assets.filter((a) => {
  const n = a.split("/").pop();
  return !allCode.includes(n) && !files.some((f) => /\.(html|json|xml|txt|css)$/.test(f) && f !== a && readFileSync(f, "utf8").includes(n));
});
console.log(unrefAssets.length ? `  sem referência: ${unrefAssets.join(", ")}` : "  Todos referenciados 👍");

console.log("\n=== Logs de desenvolvimento em src/ ===");
const logs = [...code].filter(([, c]) => /console\.(log|debug|table)\(/.test(c)).map(([f]) => f);
console.log(logs.length ? logs.map((f) => `  ${f}`).join("\n") : "  Nenhum 👍");

console.log("\n=== Imagens grandes (>150 KB) ===");
const big = bySize.filter(([f, s]) => /\.(png|jpe?g|gif|ico)$/.test(extname(f) ? f : "") && s > 150 * 1024);
console.log(big.length ? big.map(([f, s]) => `  ${kb(s)} ${f} → converter para .webp ou mover para o CDN`).join("\n") : "  Nenhuma 👍");
