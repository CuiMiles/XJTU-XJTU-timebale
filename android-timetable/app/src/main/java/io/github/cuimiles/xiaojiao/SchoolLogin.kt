package io.github.cuimiles.xiaojiao

import android.annotation.SuppressLint
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.net.http.SslError
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
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
private const val LOGIN_FAILED = """
(function(){
  return location.protocol === 'https:' && location.hostname === 'login.xjtu.edu.cn' &&
    !!(window.loginError && loginError.loginType === 'passwordLogin' &&
      (loginError.hasErrors || (loginError.errors && loginError.errors.length)));
})()
"""

private fun autoLoginScript(credentials: SchoolCredentials): String = """
(function(){
  if (location.protocol !== 'https:' || location.hostname !== 'login.xjtu.edu.cn' ||
      location.pathname !== '/cas/login') return 'wrong-origin';
  var form = document.querySelector('#fm1');
  var account = form && form.querySelector('input[name="username"]');
  var password = form && form.querySelector('input[name="password"]');
  if (!account || !password || typeof _passwordLogin !== 'function' || typeof vm === 'undefined') return 'wait';
  var userValue = ${JSONObject.quote(credentials.account)};
  var passwordValue = ${JSONObject.quote(credentials.password)};
  vm.passwordLoginUsername = userValue;
  vm.passwordLoginPassword = passwordValue;
  account.value = userValue;
  password.value = passwordValue;
  _passwordLogin();
  return 'submitted';
})()
"""

private fun schoolUrl(uri: Uri?): Boolean {
    val host = uri?.host?.lowercase() ?: return false
    return uri.scheme == "https" && (host == "xjtu.edu.cn" || host.endsWith(".xjtu.edu.cn"))
}

private fun loginUrl(url: String?): Boolean {
    val uri = url?.let(Uri::parse) ?: return false
    return uri.scheme == "https" && uri.host.equals("login.xjtu.edu.cn", ignoreCase = true)
        && uri.path == "/cas/login"
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun SchoolLogin(
    credentialVault: CredentialVault,
    onImported: (List<Course>) -> Unit,
    onError: (String) -> Unit,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val saved = remember { credentialVault.load() }
    var account by remember { mutableStateOf(saved?.account.orEmpty()) }
    var password by remember { mutableStateOf("") }
    var activeCredentials by remember { mutableStateOf(saved) }
    var showWeb by remember { mutableStateOf(saved != null) }
    var saveWhenImported by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf(if (saved == null) "输入学校账号和密码" else "正在使用本机保存的账号刷新课表…") }
    var webView by remember { mutableStateOf<WebView?>(null) }
    var targetRequested by remember { mutableStateOf(false) }
    var completed by remember { mutableStateOf(false) }
    var autoAttempted by remember { mutableStateOf(false) }
    var autoSubmitted by remember { mutableStateOf(false) }
    var tableAttempt by remember { mutableIntStateOf(0) }
    val currentImported by rememberUpdatedState(onImported)
    val currentError by rememberUpdatedState(onError)
    val handler = remember { Handler(Looper.getMainLooper()) }

    fun disposeWeb(view: WebView) {
        view.stopLoading()
        view.clearCache(true)
        view.clearFormData()
        view.loadUrl("about:blank")
        (view.parent as? ViewGroup)?.removeView(view)
        view.destroy()
    }

    fun clearWebSession() {
        CookieManager.getInstance().removeAllCookies { CookieManager.getInstance().flush() }
        WebStorage.getInstance().deleteAllData()
    }

    fun askForCredentials(reason: String) {
        credentialVault.clear()
        webView?.let(::disposeWeb)
        webView = null
        clearWebSession()
        activeCredentials = null
        password = ""
        showWeb = false
        saveWhenImported = false
        autoAttempted = false
        autoSubmitted = false
        message = reason
    }

    fun checkTable(view: WebView) {
        if (completed || webView !== view) return
        view.evaluateJavascript("(function(){var t=document.querySelector('table#tbl');return t?t.outerHTML:null})()") { result ->
            if (completed || webView !== view) return@evaluateJavascript
            if (result != "null" && result.isNotBlank()) {
                val courses = runCatching {
                    GmisParser.parse(JSONObject("{\"table\":$result}").getString("table"))
                }.getOrElse {
                    message = "课表解析失败，请重新打开课表页"
                    return@evaluateJavascript
                }
                completed = true
                message = "已获取 ${courses.size} 条课程"
                val credentials = activeCredentials
                currentImported(courses)
                if (saveWhenImported && autoSubmitted && credentials != null) {
                    runCatching { credentialVault.save(credentials.account, credentials.password) }
                        .onFailure { currentError("课表已导入，但无法在本机加密保存登录信息") }
                }
            } else if (++tableAttempt < 20) {
                handler.postDelayed({ checkTable(view) }, 800)
            } else {
                message = "尚未找到课表；可点右上角重试"
            }
        }
    }

    fun tryAutoLogin(view: WebView, credentials: SchoolCredentials, tries: Int) {
        if (completed || webView !== view || activeCredentials !== credentials || !loginUrl(view.url)) return
        view.evaluateJavascript(autoLoginScript(credentials)) { result ->
            if (completed || webView !== view || activeCredentials !== credentials) return@evaluateJavascript
            when (result) {
                "\"submitted\"" -> {
                    autoSubmitted = true
                    message = "正在通过学校官方页面登录…"
                    handler.postDelayed({
                        if (!completed && webView === view && loginUrl(view.url) && autoSubmitted)
                            message = "如学校要求额外验证，请在页面完成；也可点上方重新输入"
                    }, 35_000)
                }
                "\"wait\"" -> if (tries < 20) {
                    handler.postDelayed({ tryAutoLogin(view, credentials, tries + 1) }, 400)
                } else message = "学校登录页暂不能自动填写，请手动登录或重新输入"
                else -> message = "自动填写未完成，请在学校页面手动登录"
            }
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            handler.removeCallbacksAndMessages(null)
            webView?.let(::disposeWeb)
            webView = null
            clearWebSession()
        }
    }

    if (!showWeb) {
        Column(Modifier.fillMaxSize().padding(22.dp), verticalArrangement = Arrangement.Center) {
            Text("登录西交大教务网", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(8.dp))
            Text(message, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(18.dp))
            OutlinedTextField(account, { account = it }, label = { Text("学号或手机号") },
                modifier = Modifier.fillMaxWidth(), singleLine = true)
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(password, { password = it }, label = { Text("密码") },
                modifier = Modifier.fillMaxWidth(), singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
            Spacer(Modifier.height(16.dp))
            Button(onClick = {
                activeCredentials = SchoolCredentials(account.trim(), password, System.currentTimeMillis())
                password = ""
                saveWhenImported = true
                autoAttempted = false
                autoSubmitted = false
                showWeb = true
                message = "正在打开学校官方登录页…"
            }, enabled = account.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
                Text("登录（免重新登录）")
            }
            TextButton(onClick = {
                activeCredentials = null
                saveWhenImported = false
                showWeb = true
                message = "请在学校官方页面登录；网页手动登录不会保存密码"
            }) { Text("使用学校网页手动登录") }
            TextButton(onClick = onClose) { Text("返回课表") }
        }
    } else {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().height(52.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = onClose) { Text("关闭") }
                TextButton(onClick = { askForCredentials("请重新输入学校账号和密码") }) { Text("重新输入") }
                TextButton(onClick = {
                    tableAttempt = 0
                    targetRequested = false
                    autoAttempted = false
                    autoSubmitted = false
                    webView?.loadUrl(TARGET)
                }) { Text("重试") }
            }
            Text(message, modifier = Modifier.padding(horizontal = 16.dp, vertical = 5.dp),
                style = MaterialTheme.typography.bodySmall)
            androidx.compose.ui.viewinterop.AndroidView(
                factory = {
                    WebView(context).apply {
                        webView = this
                        setBackgroundColor(AndroidColor.WHITE)
                        importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
                        settings.javaScriptEnabled = true // CAS requires JS; no native JS bridge is exposed.
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
                                if (webView !== view || completed) return
                                val uri = Uri.parse(url)
                                if (!schoolUrl(uri)) return
                                if (loginUrl(url)) {
                                    view.evaluateJavascript(PREPARE_LOGIN, null)
                                    if (autoSubmitted) {
                                        view.evaluateJavascript(LOGIN_FAILED) { failed ->
                                            if (failed == "true" && webView === view)
                                                askForCredentials("学校登录失败，请重新输入账号和密码")
                                        }
                                    } else if (!autoAttempted) {
                                        val credentials = activeCredentials
                                        if (credentials != null) {
                                            autoAttempted = true
                                            tryAutoLogin(view, credentials, 0)
                                        } else message = "请在学校官方页面输入账号和密码"
                                    }
                                }
                                if (uri.host.equals("gmis.xjtu.edu.cn", ignoreCase = true)) {
                                    if (uri.path == "/pyxx/pygl/xskbcx") {
                                        message = "正在读取课表…"
                                        tableAttempt = 0
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
}
