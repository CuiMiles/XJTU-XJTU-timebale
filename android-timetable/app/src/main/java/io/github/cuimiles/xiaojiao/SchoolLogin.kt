package io.github.cuimiles.xiaojiao

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.view.View
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.net.http.SslError
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import org.json.JSONObject

private const val TARGET = "https://gmis.xjtu.edu.cn/pyxx/pygl/xskbcx"
private const val PREPARE_LOGIN = """
(function(){
  var width = Math.min(window.screen.width || 390, 1200);
  var scale = Math.min(1, width / 1200);
  var meta = document.querySelector('meta[name="viewport"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; document.head.appendChild(meta); }
  meta.content = 'width=1200, initial-scale=' + scale;
  var tries = 0;
  function showPassword(){
    var items = Array.prototype.slice.call(document.querySelectorAll('li.el-menu-item'));
    var tab = items.find(function(item){ return /Password Login|账号密码|密码登录/.test(item.textContent || ''); });
    if (tab && !tab.classList.contains('is-active')) tab.click();
    else if (!tab && ++tries < 15) setTimeout(showPassword, 400);
  }
  showPassword();
})()
"""

private fun schoolUrl(uri: Uri?): Boolean {
    val host = uri?.host?.lowercase() ?: return false
    return uri.scheme == "https" && (host == "xjtu.edu.cn" || host.endsWith(".xjtu.edu.cn"))
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun SchoolLogin(onImported: (List<Course>) -> Unit, onClose: () -> Unit) {
    val context = LocalContext.current
    var message by remember { mutableStateOf("请在西交大官方页面输入学号或手机号和密码") }
    var webView by remember { mutableStateOf<WebView?>(null) }
    val currentImported by rememberUpdatedState(onImported)
    val handler = remember { Handler(Looper.getMainLooper()) }
    var targetRequested by remember { mutableStateOf(false) }
    var completed by remember { mutableStateOf(false) }
    var attempt by remember { mutableIntStateOf(0) }

    fun checkTable(view: WebView) {
        if (completed) return
        view.evaluateJavascript("(function(){var t=document.querySelector('table#tbl');return t?t.outerHTML:null})()") { result ->
            if (completed) return@evaluateJavascript
            if (result != "null" && result.isNotBlank()) {
                try {
                    val html = JSONObject("{\"table\":$result}").getString("table")
                    val courses = GmisParser.parse(html)
                    completed = true
                    message = "已获取 ${courses.size} 条课程"
                    currentImported(courses)
                } catch (_: Exception) {
                    message = "课表解析失败，请重新打开课表页"
                }
            } else if (++attempt < 20) {
                handler.postDelayed({ if (!completed && webView === view) checkTable(view) }, 800)
            } else {
                message = "尚未找到课表；可点右上角重试"
            }
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            handler.removeCallbacksAndMessages(null)
            webView?.let { view ->
                view.stopLoading()
                view.loadUrl("about:blank")
                (view.parent as? ViewGroup)?.removeView(view)
                view.destroy()
            }
            CookieManager.getInstance().removeAllCookies(null)
            WebStorage.getInstance().deleteAllData()
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().height(52.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = onClose) { Text("关闭") }
            TextButton(onClick = { attempt = 0; targetRequested = false; webView?.loadUrl(TARGET) }) { Text("重新打开课表") }
        }
        Text(message, modifier = Modifier.padding(horizontal = 16.dp, vertical = 5.dp), style = MaterialTheme.typography.bodySmall)
        androidx.compose.ui.viewinterop.AndroidView(
            factory = {
                WebView(context).apply {
                    webView = this
                    setBackgroundColor(AndroidColor.WHITE)
                    importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
                    settings.javaScriptEnabled = true // CAS requires JavaScript; no native JS bridge is exposed.
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    settings.allowFileAccessFromFileURLs = false
                    settings.allowUniversalAccessFromFileURLs = false
                    settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    settings.safeBrowsingEnabled = true
                    settings.setSupportMultipleWindows(false)
                    settings.javaScriptCanOpenWindowsAutomatically = false
                    settings.useWideViewPort = true
                    settings.loadWithOverviewMode = true
                    settings.builtInZoomControls = true
                    settings.displayZoomControls = false
                    settings.setSupportZoom(true)
                    CookieManager.getInstance().setAcceptCookie(true)
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                    webChromeClient = WebChromeClient()
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                            if (!request.isForMainFrame) return false
                            if (schoolUrl(request.url)) return false
                            message = "已阻止非西交大官方页面"
                            return true
                        }
                        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                            handler.cancel()
                            message = "学校页面证书验证失败，已停止连接"
                        }
                        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                            if (request.isForMainFrame) message = "学校页面加载失败，请检查网络后重试"
                        }
                        override fun onPageFinished(view: WebView, url: String) {
                            val uri = Uri.parse(url)
                            if (!schoolUrl(uri)) return
                            if (uri.host.equals("login.xjtu.edu.cn", ignoreCase = true)) {
                                view.evaluateJavascript(PREPARE_LOGIN, null)
                                message = "请在学校官方页面输入学号或手机号和密码"
                            }
                            if (uri.host.equals("gmis.xjtu.edu.cn", ignoreCase = true)) {
                                if (uri.path == "/pyxx/pygl/xskbcx") {
                                    message = "正在读取课表…"
                                    attempt = 0
                                    checkTable(view)
                                } else if (!targetRequested) {
                                    targetRequested = true
                                    view.loadUrl(TARGET)
                                }
                            }
                        }
                    }
                    loadUrl(TARGET)
                }
            },
            modifier = Modifier.fillMaxSize(),
        )
    }
}
