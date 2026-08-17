/**
 * Etapa 1 — multiprocesso no Core.
 *
 * Sobe N processos Node do MESMO servidor Nitro (.output/server/index.mjs),
 * um por vCPU, compartilhando a porta via cluster do Node.
 *
 * Rollback: CORE_CLUSTER_WORKERS=1 (ou ausente) → comportamento atual,
 * processo único, sem cluster.
 */
import cluster from "node:cluster";
import os from "node:os";

const ENTRY = "../.output/server/index.mjs";

function desiredWorkers() {
  const raw = process.env.CORE_CLUSTER_WORKERS;
  if (!raw || raw.trim() === "") return 1;
  if (raw.trim() === "auto") return Math.max(1, os.availableParallelism?.() ?? os.cpus().length);
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

const workers = desiredWorkers();

if (workers <= 1 || !cluster.isPrimary) {
  if (workers <= 1) console.log("[cluster] desativado (CORE_CLUSTER_WORKERS<=1) — processo único");
  await import(ENTRY);
} else {
  console.log(`[cluster] iniciando ${workers} workers (pid primário ${process.pid})`);
  for (let i = 0; i < workers; i++) cluster.fork();

  let shuttingDown = false;
  cluster.on("exit", (worker, code, signal) => {
    if (shuttingDown) return;
    console.error(`[cluster] worker ${worker.process.pid} saiu (code=${code} signal=${signal}) — respawn`);
    cluster.fork();
  });

  for (const sig of ["SIGTERM", "SIGINT"]) {
    process.on(sig, () => {
      shuttingDown = true;
      for (const w of Object.values(cluster.workers ?? {})) w?.kill(sig);
      process.exit(0);
    });
  }
}
