package site.streammonitor.probe

import org.json.JSONArray
import org.json.JSONObject

data class ProbeResult(
    val loginOk: Boolean = false,
    val apiOk: Boolean = false,
    val liveUrl: String? = null,
    val movieUrl: String? = null,
    val episodeUrl: String? = null,
    val summary: String = "",
)

/**
 * Executa a bateria: login -> catálogo -> 1 canal -> 1 filme -> 1 episódio.
 * Cada passo loga HTTP_STATUS, tempo e motivo exato da falha.
 */
object ProbeRunner {

    fun run(creds: XtreamCreds): ProbeResult {
        val c = XtreamClient(creds)
        ProbeLog.log("START", "base=${c.base} ua=${creds.userAgent}")

        // 1. LOGIN
        val login = c.login()
        ProbeLog.log("HTTP_STATUS", "player_api.php -> ${login.status} ct=${login.contentType} err=${login.error ?: "-"}", login.ms)
        val authOk = try {
            JSONObject(login.body ?: "").optJSONObject("user_info")?.optInt("auth", 0) == 1
        } catch (_: Exception) { false }

        if (!authOk) {
            val reason = when {
                login.error != null -> login.error
                login.status == 403 -> "403 — bloqueio na origem (WAF/Cloudflare) para este IP/UA"
                login.status == 404 -> "404 vazio — painel não expõe rota Xtream para este IP"
                login.status == 0 -> "sem resposta de rede"
                else -> "resposta inválida: ${(login.body ?: "").take(160)}"
            }
            ProbeLog.log("LOGIN_FAIL", reason ?: "desconhecido")
            return ProbeResult(summary = "LOGIN_FAIL: $reason")
        }

        val info = JSONObject(login.body!!).optJSONObject("user_info")
        ProbeLog.log(
            "LOGIN_OK",
            "status=${info?.optString("status")} exp=${info?.optString("exp_date")} conns=${info?.optString("max_connections")}",
            login.ms
        )

        // 2. CATÁLOGO
        val cats = c.liveCategories()
        val live = c.liveStreams()
        val vod = c.vodStreams()
        val ser = c.series()
        ProbeLog.log(
            "API_OK",
            "categorias=${XtreamClient.arrayLength(cats.body)} canais=${XtreamClient.arrayLength(live.body)} " +
                "filmes=${XtreamClient.arrayLength(vod.body)} series=${XtreamClient.arrayLength(ser.body)}",
            cats.ms + live.ms + vod.ms + ser.ms
        )
        val apiOk = XtreamClient.arrayLength(cats.body) >= 0 && XtreamClient.arrayLength(live.body) > 0

        // 3. CANAL AO VIVO
        var liveUrl: String? = null
        XtreamClient.firstObject(live.body)?.let { ch ->
            val id = ch.optString("stream_id")
            val url = c.liveUrl(id, "m3u8")
            val probe = c.get(url)
            val isManifest = (probe.body ?: "").contains("#EXTM3U")
            ProbeLog.log("HTTP_STATUS", "live m3u8 -> ${probe.status} ct=${probe.contentType} err=${probe.error ?: "-"}", probe.ms)
            if (isManifest || probe.status in 200..299) {
                liveUrl = url
                ProbeLog.log("LIVE_OK", "${ch.optString("name")} (${if (isManifest) "HLS" else "stream"})")
            } else {
                val ts = c.liveUrl(id, "ts")
                val p2 = c.head(ts, "bytes=0-1024")
                ProbeLog.log("HTTP_STATUS", "live ts -> ${p2.status} ct=${p2.contentType} err=${p2.error ?: "-"}", p2.ms)
                if (p2.status in 200..299) {
                    liveUrl = ts
                    ProbeLog.log("LIVE_OK", "${ch.optString("name")} (MPEG-TS)")
                } else {
                    ProbeLog.log("LIVE_FAIL", "manifesto ${probe.status} / ts ${p2.status}")
                }
            }
        } ?: ProbeLog.log("LIVE_FAIL", "nenhum canal retornado pelo catálogo")

        // 4. FILME
        var movieUrl: String? = null
        XtreamClient.firstObject(vod.body)?.let { m ->
            val ext = m.optString("container_extension", "mp4").ifBlank { "mp4" }
            val url = c.movieUrl(m.optString("stream_id"), ext)
            val probe = c.head(url, "bytes=0-1024")
            ProbeLog.log("HTTP_STATUS", "movie .$ext -> ${probe.status} ct=${probe.contentType} err=${probe.error ?: "-"}", probe.ms)
            if (probe.status in 200..299) {
                movieUrl = url
                ProbeLog.log("MOVIE_OK", "${m.optString("name")} (.$ext, range=${probe.status == 206})")
            } else {
                ProbeLog.log("MOVIE_FAIL", probe.error ?: "HTTP ${probe.status}")
            }
        } ?: ProbeLog.log("MOVIE_FAIL", "nenhum filme no catálogo")

        // 5. EPISÓDIO
        var episodeUrl: String? = null
        XtreamClient.firstObject(ser.body)?.let { s ->
            val detail = c.seriesInfo(s.optString("series_id"))
            val ep = firstEpisode(detail.body)
            if (ep == null) {
                ProbeLog.log("SERIES_FAIL", "get_series_info sem episódios (HTTP ${detail.status})")
            } else {
                val ext = ep.optString("container_extension", "mp4").ifBlank { "mp4" }
                val url = c.episodeUrl(ep.optString("id"), ext)
                val probe = c.head(url, "bytes=0-1024")
                ProbeLog.log("HTTP_STATUS", "episode .$ext -> ${probe.status} ct=${probe.contentType} err=${probe.error ?: "-"}", probe.ms)
                if (probe.status in 200..299) {
                    episodeUrl = url
                    ProbeLog.log("SERIES_OK", "${s.optString("name")} — ${ep.optString("title")} (.$ext)")
                } else {
                    ProbeLog.log("SERIES_FAIL", probe.error ?: "HTTP ${probe.status}")
                }
            }
        } ?: ProbeLog.log("SERIES_FAIL", "nenhuma série no catálogo")

        return ProbeResult(
            loginOk = true,
            apiOk = apiOk,
            liveUrl = liveUrl,
            movieUrl = movieUrl,
            episodeUrl = episodeUrl,
            summary = "login=OK api=${if (apiOk) "OK" else "FAIL"} tv=${ok(liveUrl)} filme=${ok(movieUrl)} serie=${ok(episodeUrl)}",
        )
    }

    private fun ok(v: String?) = if (v != null) "OK" else "FAIL"

    private fun firstEpisode(body: String?): JSONObject? = try {
        val eps = JSONObject(body ?: "").optJSONObject("episodes")
        val key = eps?.keys()?.asSequence()?.firstOrNull()
        val arr = key?.let { eps.optJSONArray(it) } ?: JSONArray()
        if (arr.length() > 0) arr.getJSONObject(0) else null
    } catch (_: Exception) { null }
}
