package site.streammonitor.play.monitor

import android.util.Log
import androidx.compose.runtime.mutableStateListOf

/**
 * Log de desenvolvimento — visível na tela e no Logcat (tag SMPROBE).
 * Nunca imprime a senha.
 */
object ProbeLog {
    const val TAG = "SMPROBE"
    val lines = mutableStateListOf<String>()

    fun log(tag: String, message: String, ms: Long? = null) {
        val t = ms?.let { " (${it}ms)" } ?: ""
        val line = "[$tag] $message$t"
        Log.d(TAG, line)
        lines.add(line)
    }

    fun clear() = lines.clear()

    fun dump(): String = lines.joinToString("\n")
}
