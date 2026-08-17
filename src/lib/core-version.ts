/**
 * Versão do protocolo de streaming Core/Worker.
 * Serve para confirmar, em produção, se o Worker AWS já roda a versão atual.
 * Incremente sempre que o contrato de /api/public/core/stream mudar.
 */
export const CORE_STREAM_VERSION = "2026.08.17-stream-v5-cache";
