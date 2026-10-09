package io.github.cuimiles.xiaojiao

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.net.Uri
import android.provider.Settings

object ReminderSystemSettings {
    fun details(context: Context) = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
        Uri.parse("package:${context.packageName}"))

    fun notifications(context: Context): Intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)

    fun channel(context: Context): Intent = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        .putExtra(Settings.EXTRA_CHANNEL_ID, CourseReminderNotifications.CHANNEL)

    /** OEM pages are optional, undocumented entry points: try them, then the app's own system page. */
    fun background(context: Context): List<Intent> {
        val components = when (Build.MANUFACTURER.lowercase()) {
            "vivo", "iqoo" -> listOf(
                "com.vivo.permissionmanager/com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
                "com.iqoo.secure/com.iqoo.secure.ui.phoneoptimize.BgStartUpManager",
                "com.iqoo.secure/com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity")
            "xiaomi", "redmi" -> listOf(
                "com.miui.securitycenter/com.miui.permcenter.autostart.AutoStartManagementActivity")
            "oppo", "realme", "oneplus" -> listOf(
                "com.coloros.safecenter/com.coloros.safecenter.startupapp.StartupAppListActivity",
                "com.coloros.safecenter/com.coloros.safecenter.permission.startup.StartupAppListActivity",
                "com.oppo.safe/com.oppo.safe.permission.startup.StartupAppListActivity")
            "huawei", "honor" -> listOf(
                "com.huawei.systemmanager/com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
                "com.huawei.systemmanager/com.huawei.systemmanager.optimize.process.ProtectActivity")
            "samsung" -> listOf(
                "com.samsung.android.lool/com.samsung.android.sm.battery.ui.BatteryActivity")
            else -> emptyList()
        }
        return components.map { component ->
            Intent().setComponent(ComponentName.unflattenFromString(component))
                .putExtra("packageName", context.packageName)
                .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        } + details(context)
    }

    fun open(context: Context, intents: List<Intent>): Boolean = intents.any { intent ->
        runCatching { context.startActivity(intent); true }.getOrDefault(false)
    }
}
