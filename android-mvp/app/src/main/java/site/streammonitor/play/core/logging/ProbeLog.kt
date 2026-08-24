package site.streammonitor.play.core.logging

import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.compose.runtime.mutableStateListOf

/**
 * Log de diagnóstico compartilhado — visível na tela e no Logcat (tag SMPROBE).
 *
 * Pacote estável (core.logging): não depende de namespace de feature, então
 * mudanças de applicationId/módulos não quebram os imports.
 *
 * Thread-safe: qualquer thread pode chamar log(); a lista observada pelo Compose
 * só é alterada na main thread (evita crash de snapshot concorrente).
 */
object ProbeLog {
    const val TAG = "SMPROBE"

    val lines = mutableStateListOf<String>()

    private val main = Handler(Looper.getMainLooper())

    private fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
    }

    fun log(tag: String, message: String, ms: Long? = null) {
        val t = ms?.let { " (${it}ms)" } ?: ""
        val line = "[$tag] $message$t"
        Log.d(TAG, line)
        onMain {
            if (lines.size > 400) lines.removeAt(0)
            lines.add(line)
        }
    }

    fun clear() = onMain { lines.clear() }

    fun dump(): String = lines.joinToString("\n")
}
