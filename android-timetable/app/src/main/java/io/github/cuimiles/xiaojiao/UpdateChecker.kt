package io.github.cuimiles.xiaojiao

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.Locale
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class ReleaseInfo(val versionCode: Int, val versionName: String)

object UpdatePolicy {
    const val AUTO_CHECK_INTERVAL_MS = 7L * 24 * 60 * 60 * 1000

    fun shouldAutoCheck(lastAttempt: Long, lastSource: String?, source: String, now: Long): Boolean =
        lastSource != source || lastAttempt <= 0 || now < lastAttempt ||
            now - lastAttempt >= AUTO_CHECK_INTERVAL_MS

    fun isNewer(release: ReleaseInfo, installedVersionCode: Int): Boolean =
        release.versionCode > installedVersionCode
}

object UpdateChecker {
    fun endpoint(installUrl: String): URL {
        val uri = URI(installUrl.trim())
        val scheme = uri.scheme?.lowercase(Locale.ROOT)
        require(scheme == "http" || scheme == "https") { "地址必须以 http:// 或 https:// 开头" }
        require(uri.host != null && uri.userInfo == null && uri.port in -1..65535 && uri.port != 0) {
            "校园网下载地址无效"
        }
        return URI(scheme, null, uri.host, uri.port, "/version.json", null, null).toURL()
    }

    fun parse(payload: String): ReleaseInfo {
        val data = Json.parseToJsonElement(payload).jsonObject
        val code = data["versionCode"]?.jsonPrimitive?.intOrNull
        val name = data["versionName"]?.jsonPrimitive?.content.orEmpty()
        require(code != null && code > 0 && name.matches(Regex("[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}"))) {
            "版本信息无效"
        }
        return ReleaseInfo(code, name)
    }

    fun fetch(endpoint: URL): ReleaseInfo {
        val connection = (endpoint.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 2500
            readTimeout = 2500
            instanceFollowRedirects = false
            useCaches = false
            setRequestProperty("Accept", "application/json")
        }
        try {
            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                throw IOException("更新服务返回 HTTP ${connection.responseCode}")
            }
            if (connection.contentLength > 4096) throw IOException("版本信息过大")
            val bytes = ByteArrayOutputStream()
            connection.inputStream.use { input ->
                val buffer = ByteArray(1024)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    if (bytes.size() + count > 4096) throw IOException("版本信息过大")
                    bytes.write(buffer, 0, count)
                }
            }
            return parse(bytes.toString(Charsets.UTF_8.name()))
        } finally {
            connection.disconnect()
        }
    }
}
