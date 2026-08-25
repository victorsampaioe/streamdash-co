package site.streammonitor.play.ui

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import site.streammonitor.play.data.XtreamClient
import site.streammonitor.play.data.XtreamCreds
import site.streammonitor.play.core.logging.ProbeLog
import site.streammonitor.play.monitor.ProbeResult
import site.streammonitor.play.monitor.ProbeRunner
import site.streammonitor.play.player.PlayerBox
import site.streammonitor.play.domain.AuthRepository
import site.streammonitor.play.domain.LoginOutcome
import site.streammonitor.play.network.ApiConfig

private data class Preset(val label: String, val dns: String, val user: String, val pass: String)

private val PRESETS = listOf(
    Preset("NEW", "http://newprivate.lat", "852119937976", "224642638687"),
    Preset("UNIPLAY", "http://dnskay.top", "762500345", "346520738"),
)

private val USER_AGENTS = listOf(
    "IPTVSmartersPlayer",
    "VLC/3.0.20 LibVLC/3.0.20",
    "Lavf/60.16.100",
    "okhttp/4.12.0",
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Registra as falhas não tratadas no Logcat (tag SMPROBE) antes de encerrar,
        // para que qualquer crash residual fique rastreável.
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e(ProbeLog.TAG, "UNCAUGHT em ${thread.name}: ${throwable.javaClass.simpleName}: ${throwable.message}", throwable)
            previous?.uncaughtException(thread, throwable)
        }
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme(colorScheme = darkColorScheme()) { Surface { ProbeScreen() } } }
    }
}

@Composable
private fun ProbeScreen() {
    var dns by remember { mutableStateOf(PRESETS[0].dns) }
    var user by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    var uaIndex by remember { mutableIntStateOf(0) }
    var running by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<ProbeResult?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var playUrl by remember { mutableStateOf<String?>(null) }
    var autoMode by remember { mutableStateOf(true) }
    var resolvedInfo by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val userAgent = USER_AGENTS[uaIndex]

    Column(
        Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(24.dp))
        Text("Stream Monitor Play", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(8.dp))
        Text("Acesse seu conteúdo premium", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(24.dp))

        // Modo de acesso
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = autoMode,
                onClick = { autoMode = true },
                enabled = !running,
                label = { Text("Usuário e senha") },
                modifier = Modifier.weight(1f)
            )
            FilterChip(
                selected = !autoMode,
                onClick = { autoMode = false },
                enabled = !running,
                label = { Text("DNS manual") },
                modifier = Modifier.weight(1f)
            )
        }

        if (!autoMode) {
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PRESETS.forEach { p ->
                    OutlinedButton(
                        onClick = { dns = p.dns; user = p.user; pass = p.pass },
                        modifier = Modifier.weight(1f),
                        enabled = !running
                    ) { Text(p.label) }
                }
            }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = dns,
                onValueChange = { dns = it },
                label = { Text("DNS / Servidor") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        }

        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = user,
            onValueChange = { user = it },
            label = { Text("Usuário") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = pass,
            onValueChange = { pass = it },
            label = { Text("Senha") },
            visualTransformation = PasswordVisualTransformation(),
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(12.dp))
        Text("API: ${ApiConfig.BASE_URL}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("User-Agent: $userAgent", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
        TextButton(
            onClick = { uaIndex = (uaIndex + 1) % USER_AGENTS.size },
            enabled = !running
        ) { Text("Trocar User-Agent") }

        Spacer(Modifier.height(16.dp))

        Button(
            enabled = !running && user.isNotBlank() && pass.isNotBlank() && (autoMode || dns.isNotBlank()),
            onClick = {
                running = true
                error = null
                result = null
                playUrl = null
                resolvedInfo = null
                ProbeLog.clear()
                scope.launch {
                    try {
                        var targetDns = dns
                        if (autoMode) {
                            when (val outcome = withContext(Dispatchers.IO) {
                                AuthRepository.login(user.trim(), pass.trim())
                            }) {
                                is LoginOutcome.Failure -> {
                                    error = outcome.message
                                    running = false
                                    return@launch
                                }
                                is LoginOutcome.Success -> {
                                    targetDns = outcome.dns
                                    dns = outcome.dns
                                    resolvedInfo = "Servidor: ${outcome.serverName ?: outcome.dns} • server_id=${outcome.serverId ?: "-"} • reseller_id=${outcome.resellerId ?: "-"}"
                                    outcome.serverId?.let { sid ->
                                        withContext(Dispatchers.IO) { AuthRepository.serverStatus(sid) }?.let { st ->
                                            ProbeLog.log("SERVER_STATUS", "${st.status} — ${st.message} (${st.latency ?: "-"}ms)")
                                        }
                                    }
                                    outcome.resellerId?.let { rid ->
                                        withContext(Dispatchers.IO) { AuthRepository.appConfig(rid) }?.let { cfg ->
                                            ProbeLog.log("BRANDING", "${cfg.app_name} cor=${cfg.primary_color}")
                                        }
                                    }
                                }
                            }
                        }

                        val creds = XtreamCreds(
                            dns = XtreamClient.normalizeBase(targetDns),
                            username = user.trim(),
                            password = pass.trim(),
                            userAgent = userAgent,
                        )
                        val r = withContext(Dispatchers.IO) {
                            try {
                                ProbeRunner.run(creds)
                            } catch (t: Throwable) {
                                ProbeLog.log("FATAL", "${t.javaClass.simpleName}: ${t.message}")
                                ProbeResult(summary = "FATAL: ${t.javaClass.simpleName}: ${t.message}")
                            }
                        }
                        result = r
                        if (!r.loginOk) error = r.summary
                        else playUrl = r.liveUrl ?: r.movieUrl ?: r.episodeUrl
                    } catch (t: Throwable) {
                        error = "${t.javaClass.simpleName}: ${t.message}"
                        ProbeLog.log("FATAL", error!!)
                    } finally {
                        running = false
                    }
                }
            },

            modifier = Modifier.fillMaxWidth().height(56.dp)
        ) {
            if (running) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
            } else {
                Text("Entrar")
            }
        }

        resolvedInfo?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.secondary)
        }

        error?.let {
            Spacer(Modifier.height(16.dp))
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }

        result?.takeIf { it.loginOk }?.let {
            Spacer(Modifier.height(16.dp))
            Text("Login OK — ${it.summary}", color = MaterialTheme.colorScheme.secondary, style = MaterialTheme.typography.bodyMedium)
        }

        playUrl?.let { url ->
            Spacer(Modifier.height(16.dp))
            Text("Reproduzindo: $url", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(8.dp))
            PlayerBox(url = url, userAgent = userAgent, modifier = Modifier.fillMaxWidth().height(220.dp))
        }

        if (ProbeLog.lines.isNotEmpty()) {
            Spacer(Modifier.height(24.dp))
            Text("Diagnóstico", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            SelectionContainer {
                Column(Modifier.fillMaxWidth()) {
                    ProbeLog.lines.forEach { line ->
                        Text(line, fontFamily = FontFamily.Monospace, fontSize = 11.sp)
                    }
                }
            }
        }

        Spacer(Modifier.height(32.dp))
        Text("Powered by Stream Monitor", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
        Spacer(Modifier.height(24.dp))
    }
}
