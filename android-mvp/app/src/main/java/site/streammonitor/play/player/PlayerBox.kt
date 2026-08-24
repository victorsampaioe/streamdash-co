package site.streammonitor.play.player

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import okhttp3.OkHttpClient
import site.streammonitor.play.core.logging.ProbeLog
import java.util.concurrent.TimeUnit

/**
 * ExoPlayer/Media3 com OkHttp: cobre HLS (.m3u8), MP4 (seek/range) e MPEG-TS.
 * Trilhas de qualidade alternativas do HLS são resolvidas pelo próprio Media3.
 */
@OptIn(UnstableApi::class)
@Composable
fun PlayerBox(url: String, userAgent: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current

    val player = remember(url, userAgent) {
      try {
        val ok = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .followRedirects(true)
            .build()

        val httpFactory = OkHttpDataSource.Factory(ok)
            .setUserAgent(userAgent)
            .setDefaultRequestProperties(mapOf("Accept" to "*/*"))

        ExoPlayer.Builder(context)
            .setMediaSourceFactory(
                DefaultMediaSourceFactory(DefaultDataSource.Factory(context, httpFactory))
            )
            .build()
            .apply {
                addListener(object : Player.Listener {
                    override fun onPlayerError(error: PlaybackException) {
                        ProbeLog.log("PLAYER_FAIL", "${error.errorCodeName}: ${error.message}")
                    }

                    override fun onPlaybackStateChanged(state: Int) {
                        when (state) {
                            Player.STATE_BUFFERING -> ProbeLog.log("PLAYER", "buffering")
                            Player.STATE_READY -> ProbeLog.log("PLAYER_OK", "playing dur=${duration}ms")
                            Player.STATE_ENDED -> ProbeLog.log("PLAYER", "ended")
                        }
                    }
                })
                setMediaItem(MediaItem.fromUri(url))
                prepare()
                playWhenReady = true
            }
      } catch (t: Throwable) {
          ProbeLog.log("PLAYER_FAIL", "init: ${t.javaClass.simpleName}: ${t.message}")
          null
      }
    }

    if (player == null) return

    DisposableEffect(player) { onDispose { runCatching { player.release() } } }

    AndroidView(
        modifier = modifier,
        factory = { ctx -> PlayerView(ctx).apply { this.player = player; useController = true } },
    )
}
