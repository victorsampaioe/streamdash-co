package site.streammonitor.probe

import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

data class XtreamCreds(
    val dns: String,
    val username: String,
    val password: String,
    val userAgent: String,
)

data class HttpResult(
    val status: Int,
    val body: String?,
    val contentType: String?,
    val ms: Long,
    val error: String?,
)

/**
 * Cliente Xtream direto do dispositivo — sem Core AWS.
 * Aceita HTTP e HTTPS (inclusive certificado self-signed, comum nesses painéis).
 */
class XtreamClient(private val creds: XtreamCreds) {

    val base: String = normalizeBase(creds.dns)

    private val http: OkHttpClient by lazy {
        val trustAll = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        }
        val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trustAll), null) }
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .followRedirects(true)
            .retryOnConnectionFailure(true)
            .sslSocketFactory(ssl.socketFactory, trustAll)
            .hostnameVerifier { _, _ -> true }
            .build()
    }

    fun get(url: String): HttpResult {
        val started = System.currentTimeMillis()
        return try {
            val req = Request.Builder()
                .url(url)
                .header("User-Agent", creds.userAgent)
                .header("Accept", "*/*")
                .header("Connection", "close")
                .build()
            http.newCall(req).execute().use { res ->
                val body = res.body?.string()
                HttpResult(
                    status = res.code,
                    body = body,
                    contentType = res.header("Content-Type"),
                    ms = System.currentTimeMillis() - started,
                    error = null,
                )
            }
        } catch (e: Exception) {
            HttpResult(0, null, null, System.currentTimeMillis() - started, "${e.javaClass.simpleName}: ${e.message}")
        }
    }

    fun head(url: String, range: String? = null): HttpResult {
        val started = System.currentTimeMillis()
        return try {
            val b = Request.Builder().url(url)
                .header("User-Agent", creds.userAgent)
                .header("Accept", "*/*")
            if (range != null) b.header("Range", range) else b.head()
            http.newCall(b.build()).execute().use { res ->
                HttpResult(res.code, null, res.header("Content-Type"), System.currentTimeMillis() - started, null)
            }
        } catch (e: Exception) {
            HttpResult(0, null, null, System.currentTimeMillis() - started, "${e.javaClass.simpleName}: ${e.message}")
        }
    }

    private fun api(action: String? = null, extra: String = ""): String {
        val a = action?.let { "&action=$it" } ?: ""
        return "$base/player_api.php?username=${creds.username}&password=${creds.password}$a$extra"
    }

    fun login(): HttpResult = get(api())
    fun liveCategories(): HttpResult = get(api("get_live_categories"))
    fun liveStreams(): HttpResult = get(api("get_live_streams"))
    fun vodStreams(): HttpResult = get(api("get_vod_streams"))
    fun series(): HttpResult = get(api("get_series"))
    fun seriesInfo(id: String): HttpResult = get(api("get_series_info", "&series_id=$id"))

    fun liveUrl(streamId: String, ext: String = "m3u8") =
        "$base/live/${creds.username}/${creds.password}/$streamId.$ext"

    fun movieUrl(streamId: String, ext: String) =
        "$base/movie/${creds.username}/${creds.password}/$streamId.$ext"

    fun episodeUrl(episodeId: String, ext: String) =
        "$base/series/${creds.username}/${creds.password}/$episodeId.$ext"

    companion object {
        fun normalizeBase(raw: String): String {
            var v = raw.trim().removeSuffix("/")
            if (!v.startsWith("http://") && !v.startsWith("https://")) v = "http://$v"
            return v
        }

        fun firstObject(body: String?): JSONObject? = try {
            val arr = JSONArray(body ?: "")
            if (arr.length() > 0) arr.getJSONObject(0) else null
        } catch (_: Exception) { null }

        fun arrayLength(body: String?): Int = try { JSONArray(body ?: "").length() } catch (_: Exception) { -1 }
    }
}
