package com.tfjl.tfjl_assistant

import android.content.Intent
import android.net.Uri
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    companion object {
        const val CHANNEL = "com.tfjl.app/share"
        var pending: MutableMap<String, Any>? = null
        var sink: EventChannel.EventSink? = null
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val binary = flutterEngine.dartExecutor.binaryMessenger

        MethodChannel(binary, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "getPending" -> {
                    result.success(pending)
                    pending = null
                }
                "readUri" -> {
                    val uri = call.argument<String>("uri")
                    result.success(if (uri == null) "" else readUriText(uri))
                }
                else -> result.notImplemented()
            }
        }

        EventChannel(binary, "$CHANNEL/events").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, events: EventChannel.EventSink) { sink = events }
            override fun onCancel(arguments: Any?) { sink = null }
        })

        handle(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    private fun handle(intent: Intent) {
        when (intent.action) {
            Intent.ACTION_SEND -> {
                val text = intent.getStringExtra(Intent.EXTRA_TEXT)
                if (!text.isNullOrEmpty()) {
                    emit(hashMapOf("type" to "text", "content" to text))
                    return
                }
                val uri: Uri? = intent.getParcelableExtra(Intent.EXTRA_STREAM)
                if (uri != null) emit(hashMapOf("type" to "uri", "uri" to uri.toString()))
            }
            Intent.ACTION_VIEW -> {
                val uri = intent.data
                if (uri != null) emit(hashMapOf("type" to "uri", "uri" to uri.toString()))
            }
        }
    }

    private fun emit(payload: Map<String, Any>) {
        pending = HashMap(payload)
        sink?.success(payload)
    }

    private fun readUriText(uriStr: String): String = try {
        val uri = Uri.parse(uriStr)
        contentResolver.openInputStream(uri)?.use { it.bufferedReader().readText() } ?: ""
    } catch (_: Exception) {
        ""
    }
}
