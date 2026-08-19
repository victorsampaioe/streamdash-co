package site.streammonitor.play.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

data class LoginRequest(
    val username: String,
    val password: String
)

data class LoginResponse(
    val status: String,
    val server: ServerInfo?,
    val reseller_id: String?,
    val error: String? = null
)

data class ServerInfo(
    val dns: String,
    val name: String
)

data class ServerStatusResponse(
    val status: String,
    val last_check: String?,
    val latency: Int?,
    val message: String
)

data class ResellerAppConfig(
    val app_name: String,
    val logo_url: String?,
    val primary_color: String,
    val footer_text: String
)

interface StreamMonitorApi {
    @POST("api/public/android/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @GET("api/public/android/status")
    suspend fun getServerStatus(@Query("server_id") serverId: String): ServerStatusResponse

    @GET("api/public/android/config")
    suspend fun getAppConfig(@Query("reseller_id") resellerId: String): ResellerAppConfig
}
