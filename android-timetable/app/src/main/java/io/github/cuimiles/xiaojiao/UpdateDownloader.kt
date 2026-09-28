package io.github.cuimiles.xiaojiao

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

object UpdateDownloader {
    private const val MAX_APK_BYTES = 80L * 1024 * 1024

    suspend fun download(context: Context, release: ReleaseInfo, onProgress: (Int) -> Unit): File =
        withContext(Dispatchers.IO) {
            val directory = File(context.cacheDir, "verified-updates")
            if (!directory.isDirectory && !directory.mkdirs()) throw IOException("无法创建下载目录")
            val partial = File.createTempFile("xiaojiao-", ".apk", directory)
            val completed = File(directory, "xiaojiao-update.apk")
            try {
                val connection = (UpdateChecker.apkUrl(release).openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 4000
                    readTimeout = 20000
                    instanceFollowRedirects = false
                    useCaches = false
                }
                val checksum = MessageDigest.getInstance("SHA-256")
                try {
                    if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                        throw IOException("下载服务返回 HTTP ${connection.responseCode}")
                    }
                    val expectedLength = connection.contentLengthLong
                    if (expectedLength > MAX_APK_BYTES) throw IOException("安装包过大")
                    var received = 0L
                    var lastProgress = -1
                    connection.inputStream.use { input ->
                        FileOutputStream(partial).use { output ->
                            val buffer = ByteArray(64 * 1024)
                            while (true) {
                                currentCoroutineContext().ensureActive()
                                val count = input.read(buffer)
                                if (count < 0) break
                                received += count
                                if (received > MAX_APK_BYTES) throw IOException("安装包过大")
                                output.write(buffer, 0, count)
                                checksum.update(buffer, 0, count)
                                if (expectedLength > 0) {
                                    val progress = (received * 100 / expectedLength).toInt().coerceIn(0, 100)
                                    if (progress >= lastProgress + 5 || progress == 100) {
                                        lastProgress = progress
                                        withContext(Dispatchers.Main) { onProgress(progress) }
                                    }
                                }
                            }
                            output.fd.sync()
                        }
                    }
                    if (received == 0L || (expectedLength >= 0 && received != expectedLength)) {
                        throw IOException("安装包下载不完整")
                    }
                } finally {
                    connection.disconnect()
                }
                val actualHash = checksum.digest().joinToString("") { "%02x".format(it.toInt() and 0xFF) }
                if (actualHash != release.sha256) throw IOException("安装包校验失败，请重新下载")
                verifyArchive(context, partial, release)
                if (completed.exists() && !completed.delete()) throw IOException("无法替换旧安装包")
                if (!partial.renameTo(completed)) throw IOException("无法保存安装包")
                completed
            } finally {
                partial.delete()
            }
        }

    @Suppress("DEPRECATION")
    private fun verifyArchive(context: Context, apk: File, release: ReleaseInfo) {
        val manager = context.packageManager
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
            PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
        val archive = manager.getPackageArchiveInfo(apk.absolutePath, flags)
            ?: throw IOException("安装包无法解析")
        val installed = manager.getPackageInfo(context.packageName, flags)
        if (archive.packageName != context.packageName ||
            PackageInfoCompat.getLongVersionCode(archive) != release.versionCode.toLong() ||
            PackageInfoCompat.getLongVersionCode(archive) <= PackageInfoCompat.getLongVersionCode(installed)) {
            throw IOException("安装包名称或版本不正确")
        }
        if (signers(archive).isEmpty() || signers(archive) != signers(installed)) {
            throw IOException("安装包签名不匹配")
        }
    }

    @Suppress("DEPRECATION")
    private fun signers(info: PackageInfo): Set<String> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
            info.signingInfo?.apkContentsSigners?.map { it.toCharsString() }?.toSet().orEmpty()
        else info.signatures?.map { it.toCharsString() }?.toSet().orEmpty()

    fun startInstaller(context: Context, apk: File) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", apk)
        context.startActivity(Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
            data = uri
            clipData = ClipData.newRawUri("小交课表更新包", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        })
    }
}
