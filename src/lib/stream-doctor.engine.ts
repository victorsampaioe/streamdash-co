/**
 * Stream Doctor: motor determinístico de triagem, sem API de IA e sem custo por token.
 * Todo diagnóstico separa evidência medida de hipótese; nenhum texto declara
 * problema local como certeza apenas porque o servidor respondeu.
 */
export type DoctorAnswers = {
  device: "smart_tv" | "tv_box" | "phone" | "computer" | "other";
  app: string;
  symptom: "buffering" | "black_screen" | "login" | "vod" | "channels" | "audio" | "other";
  when: "now" | "today" | "recurring" | "unknown";
};
export type DoctorEvidence = {
  name: string;
  status: string;
  checkedAt: string | null;
  latency: number | null;
  dnsStatus: string | null;
  paused: boolean;
  recentChecks: Array<{ status: string; checked_at: string; http_status: number | null; latency_ms: number | null }>;
  regions: Array<{ region_code: string; status: string; checked_at: string }>;
  incidents: Array<{ started_at: string; ended_at: string | null; incident_type: string | null }>;
};
export type DoctorReport = {
  severity: "critical" | "warning" | "informational";
  headline: string;
  evidence: string[];
  hypotheses: string[];
  steps: string[];
  confidence: "Alta" | "Moderada" | "Limitada";
  whatsapp: string;
  generatedAt: string;
};

const deviceNames: Record<DoctorAnswers["device"], string> = {
  smart_tv: "Smart TV", tv_box: "TV Box / Fire TV", phone: "celular", computer: "computador", other: "aparelho informado"
};
const symptomNames: Record<DoctorAnswers["symptom"], string> = {
  buffering: "travamentos e carregamento", black_screen: "tela preta", login: "erro ao entrar",
  vod: "filmes ou séries", channels: "canais ao vivo", audio: "problema de áudio", other: "falha relatada"
};

export function analyzeStreamDoctor(a: DoctorAnswers, e: DoctorEvidence, now = new Date()): DoctorReport {
  const evidence: string[] = [];
  const hypotheses: string[] = [];
  const steps: string[] = [];
  const isRecent = (date: string | null) => !!date && Number.isFinite(Date.parse(date)) && now.getTime() - Date.parse(date) >= 0 && now.getTime() - Date.parse(date) <= 30 * 60_000;
  const checks = e.recentChecks.filter(c => isRecent(c.checked_at));
  const validRegions = new Map<string, { region_code: string; status: string; checked_at: string }>();
  for (const r of e.regions.filter(r => isRecent(r.checked_at))) {
    if (!validRegions.has(r.region_code) || Date.parse(r.checked_at) > Date.parse(validRegions.get(r.region_code)!.checked_at)) validRegions.set(r.region_code, r);
  }
  const regional = [...validRegions.values()];
  const regionDown = regional.filter(r => r.status === "down").length;
  const regionUp = regional.filter(r => ["up", "online", "degraded"].includes(r.status)).length;
  const recentDown = checks.filter(c => c.status === "down").length;
  const recentUp = checks.filter(c => ["up", "online", "degraded"].includes(c.status)).length;
  const openedIncident = e.incidents.some(i => !i.ended_at && i.incident_type !== "dns");
  const snapshotRecent = isRecent(e.checkedAt);
  const dnsBroken = e.dnsStatus === "offline";
  const confirmedOutage = !e.paused && snapshotRecent && e.status === "down" && regionUp === 0 && (openedIncident || (recentDown >= 2 && regionDown >= 2));
  let severity: DoctorReport["severity"] = "informational";
  let headline = "Diagnóstico inicial — mais informações necessárias";
  let confidence: DoctorReport["confidence"] = "Limitada";

  evidence.push(snapshotRecent ? `Última verificação do servidor há ${Math.max(0, Math.floor((now.getTime() - Date.parse(e.checkedAt!)) / 60_000))} minuto(s).` : "Não há verificação recente suficiente do servidor.");
  if (snapshotRecent) evidence.push(`Estado observado: ${e.status}. ${e.latency !== null ? `Latência aproximada: ${e.latency} ms.` : "Sem medição de latência."}`);
  if (regional.length) evidence.push(`Regiões recentes: ${regionUp} respondendo, ${regionDown} com falha, ${regional.length - regionUp - regionDown} inconclusivas.`);
  if (checks.length) evidence.push(`Últimos 30 min: ${recentUp} verificações favoráveis e ${recentDown} falhas registradas.`);
  if (dnsBroken) evidence.push("O diagnóstico DNS mais recente informa falha; isso não comprova indisponibilidade do streaming.");

  if (e.paused) {
    severity = "warning"; headline = "Monitoramento pausado — não é possível confirmar a saúde atual";
    hypotheses.push("A ausência de verificações recentes impede separar falha do servidor de problema no aparelho.");
    steps.push("Reativar o monitoramento da conta e executar uma nova verificação.", "Testar em outro dispositivo e confirmar o horário da falha.");
  } else if (confirmedOutage) {
    severity = "critical"; confidence = openedIncident ? "Moderada" : "Alta";
    headline = "Há evidências de indisponibilidade do serviço";
    hypotheses.push("O incidente aberto ou as falhas recentes e independentes indicam provável problema no serviço.");
    steps.push("Confirmar uma nova checagem e consultar o incidente em aberto.", "Documentar horários e acionar o fornecedor com o histórico de falhas.", "Evitar atribuir o problema à internet do cliente sem evidência.");
  } else if (regionDown > 0 && regionUp > 0) {
    severity = "warning"; confidence = "Moderada"; headline = "Possível instabilidade de rota ou região";
    hypotheses.push("As regiões apresentam respostas diferentes; pode existir uma falha parcial.");
    steps.push("Comparar o teste da rede do cliente com regiões que estão respondendo.", "Repetir o diagnóstico antes de afirmar que o servidor caiu.");
  } else if (recentDown > 0 || (snapshotRecent && ["degraded", "down"].includes(e.status))) {
    severity = "warning"; confidence = "Moderada"; headline = "Instabilidade observada — causa ainda não confirmada";
    hypotheses.push("Falhas intermitentes podem afetar parte do serviço sem interrupção geral.");
    steps.push("Repetir a verificação e identificar o tipo de conteúdo afetado.", "Comparar o mesmo conteúdo em dispositivo e rede diferentes.");
  } else if (recentUp > 0 || regionUp > 0) {
    confidence = "Moderada"; headline = "Servidor respondeu aos testes; reprodução ainda precisa ser verificada";
    hypotheses.push("Conectividade do servidor não garante que o vídeo esteja reproduzindo normalmente.");
    steps.push("Testar um conteúdo de demonstração autorizado no aparelho afetado.", "Comparar a experiência em outro dispositivo ou rede.");
  } else {
    hypotheses.push("Não há evidências suficientes para apontar a origem da falha.");
    steps.push("Executar uma nova checagem do servidor.", "Registrar se outros clientes estão com a mesma reclamação.");
  }

  if (a.symptom === "buffering") {
    hypotheses.push("Oscilações de Wi-Fi, desempenho do aparelho ou problemas no fluxo de vídeo são possibilidades.");
    steps.push("Testar por cabo ou próximo do roteador, se disponível.", "Comparar o mesmo conteúdo em outro aparelho.");
  } else if (a.symptom === "black_screen") {
    hypotheses.push("Formato do vídeo, player, autorização ou falha no conteúdo podem produzir tela preta.");
    steps.push("Verificar se aparece áudio e se outro conteúdo autorizado reproduz.", "Comparar com outro aplicativo compatível.");
  } else if (a.symptom === "login") {
    hypotheses.push("Autenticação, assinatura, dados digitados ou indisponibilidade da API podem causar falha de login.");
    steps.push("Conferir se a assinatura está ativa e verificar o erro mostrado, sem compartilhar senhas.", "Testar o acesso pelo aplicativo oficial autorizado.");
  } else if (a.symptom === "vod" || a.symptom === "channels") {
    hypotheses.push("A falha pode estar restrita à categoria solicitada, mesmo que o restante do serviço responda.");
    steps.push("Testar dois conteúdos autorizados da mesma categoria e outro de categoria diferente.");
  } else if (a.symptom === "audio") {
    hypotheses.push("Codec de áudio incompatível ou configuração do aparelho são hipóteses a investigar.");
    steps.push("Conferir saída de áudio e testar um conteúdo de referência compatível.");
  }
  if (a.when === "recurring") steps.push("Anotar horários recorrentes para comparar com o histórico do monitor.");
  if (a.when === "now" && !snapshotRecent) steps.push("Priorizar uma checagem atual: os dados registrados podem estar desatualizados.");

  const ordered = [...new Set(steps)].slice(0, 5);
  const message = [
    "Olá! 👋 Analisamos sua reclamação no Stream Monitor.",
    `Equipamento: ${deviceNames[a.device]} | Aplicativo: ${a.app || "não informado"}.`,
    `Problema: ${symptomNames[a.symptom]}.`,
    `Resultado preliminar: ${headline}.`,
    "Vamos verificar por etapas:",
    ...ordered.slice(0, 3).map((step, i) => `${i + 1}. ${step}`),
    "Este é um diagnóstico inicial; ainda não confirma uma causa definitiva.",
  ].join("\n");
  return { severity, headline, evidence, hypotheses, steps: ordered, confidence, whatsapp: message, generatedAt: now.toISOString() };
}
