package site.streammonitor.play.domain

import site.streammonitor.play.core.logging.ProbeLog
import site.streammonitor.play.network.ApiClient
import site.streammonitor.play.network.LoginRequest
import site.streammonitor.play.network.LoginResponse
import site.streammonitor.play.network.ResellerAppConfig
import site.streammonitor.play.network.ServerStatusResponse
import site.streammonitor.play.network.StreamMonitorApi

sealed interface LoginOutcome {
    data class Success(
        val dns: String,
        val serverName: String?,
        val serverId: String?,
        val resellerId: String?,
        val resolvedBy: String?,
    ) : LoginOutcome

    data class Failure(val message: String) : LoginOutcome
}

/**
 * Login apenas com usuário + senha: o painel Stream Monitor resolve o DNS da revenda.
 * Percorre os hosts configurados em ApiConfig até um responder (imune a falha de DNS).
 */
object AuthRepository {

    suspend fun login(username: String, password: String): LoginOutcome {
        var lastError = "Não foi possível contatar a API Stream Monitor."

        for ((base, api) in ApiClient.bases) {
            ProbeLog.log("API_LOGIN", "POST ${base}api/public/android/login")
            try {
                val res = api.login(LoginRequest(username, password))
                val body: LoginResponse? = res.body()
                if (res.isSuccessful && body?.server?.dns?.isNotBlank() == true) {
                    ProbeLog.log(
                        "API_LOGIN_OK",
                        "dns=${body.server.dns} server_id=${body.server_id ?: body.server.id} reseller=${body.reseller_id} via=${body.resolved_by}",
                    )
                    return LoginOutcome.Success(
                        dns = body.server.dns,
                        serverName = body.server.name,
                        serverId = body.server_id ?: body.server.id,
                        resellerId = body.reseller_id,
                        resolvedBy = body.resolved_by,
                    )
                }

                // Resposta do servidor com erro de negócio (401/403/503): não tenta outro host.
                val msg = body?.error ?: res.errorBody()?.string()?.take(240)
                lastError = msg ?: "HTTP ${res.code()}"
                ProbeLog.log("API_LOGIN_FAIL", "HTTP ${res.code()} — $lastError")
                if (res.code() in 400..499 || res.code() == 503) return LoginOutcome.Failure(lastError)
            } catch (t: Throwable) {
                lastError = "${t.javaClass.simpleName}: ${t.message}"
                ProbeLog.log("API_UNREACHABLE", "$base -> $lastError")
            }
        }
        return LoginOutcome.Failure(lastError)
    }

    suspend fun serverStatus(serverId: String): ServerStatusResponse? = firstOk { it.getServerStatus(serverId).body() }

    suspend fun appConfig(resellerId: String): ResellerAppConfig? = firstOk { it.getAppConfig(resellerId).body() }

    private suspend fun <T> firstOk(block: suspend (StreamMonitorApi) -> T?): T? {
        for ((base, api) in ApiClient.bases) {
            try {
                block(api)?.let { return it }
            } catch (t: Throwable) {
                ProbeLog.log("API_UNREACHABLE", "$base -> ${t.javaClass.simpleName}: ${t.message}")
            }
        }
        return null
    }
}
