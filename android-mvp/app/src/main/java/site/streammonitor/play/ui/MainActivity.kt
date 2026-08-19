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
    var user by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    var running by remember { mutableStateOf(false) }
    var result by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(
        Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally
    ) {
        // Branding oficial Stream Monitor Play
        Text("Stream Monitor Play", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(8.dp))
        Text("Acesse seu conteúdo premium", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        
        Spacer(Modifier.height(32.dp))

        OutlinedTextField(
            value = user,
            onValueChange = { user = it },
            label = { Text("Usuário") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(
            value = pass,
            onValueChange = { pass = it },
            label = { Text("Senha") },
            visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(24.dp))

        Button(
            enabled = !running && user.isNotBlank() && pass.isNotBlank(),
            onClick = {
                running = true
                error = null
                result = null
                scope.launch {
                    // O fluxo real chamará Retrofit -> StreamMonitorApi
                    // Aqui simulamos a resolução automática da Fase 1
                    try {
                        kotlinx.coroutines.delay(1500)
                        result = "Servidor resolvido: NEW (newprivate.lat)"
                    } catch (e: Exception) {
                        error = e.message
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

        error?.let {
            Spacer(Modifier.height(16.dp))
            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }

        result?.let {
            Spacer(Modifier.height(16.dp))
            Text(it, color = MaterialTheme.colorScheme.secondary, style = MaterialTheme.typography.bodyMedium)
        }

        Spacer(Modifier.height(48.dp))
        Text("Powered by Stream Monitor", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
    }
}

