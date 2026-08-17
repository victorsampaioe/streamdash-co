#!/usr/bin/env bash
# Coleta CPU/RAM do container e banda da NIC durante um patamar de carga.
# Uso: ./scripts/monitor-core.sh <segundos> <arquivo-saida>
set -euo pipefail

DUR="${1:-60}"
OUT="${2:-/tmp/core-metrics-$(date -u +%H%M%S).log}"
NIC="$(ip route show default | awk '{print $5; exit}')"

read_bytes() { cat "/sys/class/net/$NIC/statistics/$1_bytes"; }

echo "nic=$NIC duracao=${DUR}s saida=$OUT"
: > "$OUT"

RX0=$(read_bytes rx); TX0=$(read_bytes tx); T0=$(date +%s)

for _ in $(seq 1 "$DUR"); do
  docker stats --no-stream --format '{{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}}' streammonitor-app >> "$OUT"
  sleep 1
done

RX1=$(read_bytes rx); TX1=$(read_bytes tx); T1=$(date +%s)
EL=$(( T1 - T0 )); [ "$EL" -gt 0 ] || EL=1

echo "--- resumo ---" | tee -a "$OUT"
awk -F'cpu=' '{split($2,a,"%"); s+=a[1]; if(a[1]>m)m=a[1]; n++} END{printf "cpu_media=%.1f%% cpu_pico=%.1f%%\n", s/n, m}' "$OUT" | tee -a "$OUT"
echo "ingress_mbps=$(( (RX1-RX0)*8/EL/1000000 )) egress_mbps=$(( (TX1-TX0)*8/EL/1000000 ))" | tee -a "$OUT"
echo "conexoes_estabelecidas=$(ss -tan state established | wc -l)" | tee -a "$OUT"
