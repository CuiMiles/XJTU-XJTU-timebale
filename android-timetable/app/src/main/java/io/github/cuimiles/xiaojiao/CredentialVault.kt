package io.github.cuimiles.xiaojiao

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import java.time.Instant
import java.time.ZoneId
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SchoolCredentials(val account: String, val password: String, val savedAt: Long)

/** A one-year credential cache; only ciphertext is stored in app-private preferences. */
class CredentialVault(context: Context) {
    private val preferences = context.getSharedPreferences("school_credentials", Context.MODE_PRIVATE)
    private val alias = "xiaojiao-school-login-v1"
    private val associatedData = "io.github.cuimiles.xiaojiao.school_credentials.v1".toByteArray()

    fun load(now: Long = System.currentTimeMillis()): SchoolCredentials? {
        val encoded = preferences.getString("encrypted", null) ?: return null
        return runCatching {
            val parts = encoded.split(':', limit = 2)
            require(parts.size == 2)
            val iv = Base64.decode(parts[0], Base64.NO_WRAP)
            require(iv.size == 12)
            val ciphertext = Base64.decode(parts[1], Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            cipher.updateAAD(associatedData)
            val json = JSONObject(String(cipher.doFinal(ciphertext), Charsets.UTF_8))
            val saved = SchoolCredentials(json.getString("account"), json.getString("password"), json.getLong("savedAt"))
            require(saved.account.isNotBlank() && saved.password.isNotBlank() && !expired(saved.savedAt, now))
            saved
        }.getOrElse {
            clear()
            null
        }
    }

    fun save(account: String, password: String, now: Long = System.currentTimeMillis()) {
        require(account.isNotBlank() && password.isNotBlank())
        val plain = JSONObject().put("account", account.trim()).put("password", password)
            .put("savedAt", now).toString().toByteArray(Charsets.UTF_8)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(associatedData)
        val encoded = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
            Base64.encodeToString(cipher.doFinal(plain), Base64.NO_WRAP)
        check(preferences.edit().putString("encrypted", encoded).commit()) { "无法保存加密登录信息" }
    }

    fun clear() {
        preferences.edit().remove("encrypted").apply()
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build())
        }.generateKey()
    }

    companion object {
        internal fun expired(savedAt: Long, now: Long): Boolean {
            if (savedAt <= 0 || savedAt > now) return true
            val end = Instant.ofEpochMilli(savedAt).atZone(ZoneId.of("Asia/Shanghai"))
                .plusYears(1).toInstant().toEpochMilli()
            return now >= end
        }
    }
}
