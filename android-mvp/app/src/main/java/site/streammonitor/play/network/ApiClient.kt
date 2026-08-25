package site.streammonitor.play.network

import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * Cliente Retrofit da API Stream Monitor com failover de host:
 * tenta o domínio oficial e, em caso de falha de DNS/rede, o host da Lovable.
 */
object ApiClient {

    private val http: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(45, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }

    private fun build(baseUrl: String): StreamMonitorApi =
        Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(http)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(StreamMonitorApi::class.java)

    val primary: StreamMonitorApi by lazy { build(ApiConfig.BASE_URL) }
    val fallback: StreamMonitorApi by lazy { build(ApiConfig.FALLBACK_BASE_URL) }

    val bases: List<Pair<String, StreamMonitorApi>>
        get() = listOf(
            ApiConfig.BASE_URL to primary,
            ApiConfig.FALLBACK_BASE_URL to fallback,
        )
}
