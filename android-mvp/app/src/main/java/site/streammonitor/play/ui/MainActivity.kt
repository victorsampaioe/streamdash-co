package site.streammonitor.play.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme(colorScheme = darkColorScheme()) { Surface { ProbeScreen() } } }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProbeScreen() {
    var dns by remember { mutableStateOf(PRESETS[0].dns) }
    var user by remember { mutableStateOf(PRESETS[0].user) }
    var pass by remember { mutableStateOf(PRESETS[0].pass) }
    var ua by remember { mutableStateOf(USER_AGENTS[0]) }
    var running by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<ProbeResult?>(null) }
    var playing by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(
        Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("Stream Monitor — Probe Android", style = MaterialTheme.typography.titleLarge)
        Text("Conexão direta do dispositivo ao painel IPTV (sem Core AWS).", fontSize = 12.sp)

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PRESETS.forEach { p ->
                OutlinedButton(onClick = { dns = p.dns; user = p.user; pass = p.pass }) { Text(p.label) }
            }
        }

        OutlinedTextField(dns, { dns = it }, label = { Text("DNS (http:// ou https://)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(user, { user = it }, label = { Text("Usuário") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(pass, { pass = it }, label = { Text("Senha") }, singleLine = true, modifier = Modifier.fillMaxWidth())

        Text("User-Agent", fontSize = 12.sp)
        USER_AGENTS.forEach { candidate ->
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                RadioButton(selected = ua == candidate, onClick = { ua = candidate })
                Text(candidate, fontSize = 11.sp)
            }
        }
        OutlinedTextField(ua, { ua = it }, label = { Text("User-Agent (editável)") }, singleLine = true, modifier = Modifier.fillMaxWidth())

        Button(
            enabled = !running,
            onClick = {
                running = true
                ProbeLog.clear()
                playing = null
                scope.launch {
                    val r = withContext(Dispatchers.IO) {
                        ProbeRunner.run(XtreamCreds(dns, user.trim(), pass.trim(), ua.trim()))
                    }
                    result = r
                    running = false
                }
            },
            modifier = Modifier.fillMaxWidth()
        ) { Text(if (running) "Testando..." else "Rodar teste (login → catálogo → TV → filme → série)") }

        result?.let { r ->
            Text(r.summary, style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                r.liveUrl?.let { u -> Button(onClick = { playing = u }) { Text("TV") } }
                r.movieUrl?.let { u -> Button(onClick = { playing = u }) { Text("Filme") } }
                r.episodeUrl?.let { u -> Button(onClick = { playing = u }) { Text("Episódio") } }
            }
        }

        playing?.let { url ->
            PlayerBox(url = url, userAgent = ua, modifier = Modifier.fillMaxWidth().height(230.dp))
            TextButton(onClick = { playing = null }) { Text("Fechar player") }
        }

        HorizontalDivider()
        Text("Logs de desenvolvimento", style = MaterialTheme.typography.titleSmall)
        SelectionContainer {
            Column {
                ProbeLog.lines.forEach { Text(it, fontFamily = FontFamily.Monospace, fontSize = 11.sp) }
            }
        }
        Spacer(Modifier.height(40.dp))
    }
}
