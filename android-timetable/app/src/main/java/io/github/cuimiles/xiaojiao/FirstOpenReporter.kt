package io.github.cuimiles.xiaojiao

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

object FirstOpenReporter {
    const val RETRY_INTERVAL_MS = 24L * 60 * 60 * 1000

    fun shouldAttempt(acknowledged: Boolean, lastAttempt: Long, now: Long): Boolean =
        !acknowledged && (lastAttempt <= 0 || now < lastAttempt || now - lastAttempt >= RETRY_INTERVAL_MS)

    fun report(installId: String, versionCode: Int) {
        require(UUID.fromString(installId).toString() == installId && versionCode > 0)
        val payload = """{"installId":"$installId","versionCode":$versionCode}""".toByteArray(Charsets.UTF_8)
        val connection = (URL("$CAMPUS_SERVER_URL/api/activate").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 2500
            readTimeout = 2500
            instanceFollowRedirects = false
            useCaches = false
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setFixedLengthStreamingMode(payload.size)
        }
        try {
            connection.outputStream.use { it.write(payload) }
            if (connection.responseCode != HttpURLConnection.HTTP_NO_CONTENT) {
                throw IOException("首次打开统计暂不可用")
            }
        } finally {
            connection.disconnect()
        }
    }
}
