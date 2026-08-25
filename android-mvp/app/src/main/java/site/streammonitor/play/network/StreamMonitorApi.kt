package site.streammonitor.play.network

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

data class LoginRequest(
    val username: String,
    val password: String,
)

data class ServerInfo(
    val id: String?,
    val dns: String,
    val name: String?,
)

data class ServerCandidate(
    val id: String,
    val name: String?,
    val dns: String,
)

data class AssociateRequest(
    val username: String,
    val password: String,
    val server_id: String,
)

data class LoginResponse(
    val status: String?,
    val resolved_by: String?,
    val server: ServerInfo?,
    val server_id: String?,
    val reseller_id: String?,
    val candidates: List<ServerCandidate>? = null,
    val error: String? = null,
)

data class ServerStatusResponse(
    val status: String,
    val last_check: String?,
    val latency: Int?,
    val message: String,
)

data class ResellerAppConfig(
    val app_name: String,
    val logo_url: String?,
    val primary_color: String,
    val footer_text: String,
)

interface StreamMonitorApi {
    @POST("api/public/android/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>

    @POST("api/public/android/associate")
    suspend fun associate(@Body request: AssociateRequest): Response<LoginResponse>

    @GET("api/public/android/status")
    suspend fun getServerStatus(@Query("server_id") serverId: String): Response<ServerStatusResponse>

    @GET("api/public/android/config")
    suspend fun getAppConfig(@Query("reseller_id") resellerId: String): Response<ResellerAppConfig>
}
