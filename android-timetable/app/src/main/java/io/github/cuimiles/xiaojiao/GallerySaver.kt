package io.github.cuimiles.xiaojiao

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object GallerySaver {
    fun saveProfile(context: Context): Uri {
        val filename = "小交课表-小红书主页-" +
            SimpleDateFormat("yyyyMMdd-HHmmss-SSS", Locale.ROOT).format(Date()) + ".jpg"
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            val directory = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "小交课表")
            require(directory.isDirectory || directory.mkdirs()) { "无法创建相册目录" }
            val file = File(directory, filename)
            try {
                context.resources.openRawResource(R.raw.xiaohongshu_profile).use { source ->
                    file.outputStream().use { destination -> source.copyTo(destination) }
                }
                MediaScannerConnection.scanFile(context, arrayOf(file.absolutePath), arrayOf("image/jpeg"), null)
                return Uri.fromFile(file)
            } catch (error: Exception) {
                file.delete()
                throw error
            }
        }

        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, filename)
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/小交课表")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val uri = resolver.insert(collection, values) ?: error("无法创建相册图片")
        try {
            context.resources.openRawResource(R.raw.xiaohongshu_profile).use { source ->
                resolver.openOutputStream(uri, "w")?.use { destination -> source.copyTo(destination) }
                    ?: error("无法写入相册图片")
            }
            values.clear()
            values.put(MediaStore.Images.Media.IS_PENDING, 0)
            require(resolver.update(uri, values, null, null) == 1) { "相册图片保存未完成" }
            return uri
        } catch (error: Exception) {
            resolver.delete(uri, null, null)
            throw error
        }
    }
}
