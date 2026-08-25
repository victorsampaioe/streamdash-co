package site.streammonitor.play.network

/**
 * ÚNICA fonte de verdade do endpoint da API Stream Monitor.
 *
 * Importante: NÃO existe host "api.streammonitor.site". A API é servida pelo
 * próprio painel (mesma origem do site), nas rotas /api/public/android/*.
 */
object ApiConfig {
    /** Produção (domínio oficial do painel). Precisa terminar com "/". */
    const val BASE_URL: String = "https://streammonitor.site/"

    /** Fallback estável da Lovable, usado se o domínio próprio falhar por DNS. */
    const val FALLBACK_BASE_URL: String = "https://streamdash-co.lovable.app/"

    const val LOGIN_PATH = "api/public/android/login"
    const val STATUS_PATH = "api/public/android/status"
    const val CONFIG_PATH = "api/public/android/config"
}
