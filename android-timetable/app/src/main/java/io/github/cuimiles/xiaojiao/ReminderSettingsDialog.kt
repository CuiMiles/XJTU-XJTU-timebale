package io.github.cuimiles.xiaojiao

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

@Composable
fun ReminderSettingsDialog(onDismiss: () -> Unit) {
    val context = LocalContext.current
    val preferences = remember { ReminderPreferences(context) }
    var settings by remember { mutableStateOf(preferences.load()) }
    var minutes by remember { mutableStateOf(settings.leadMinutes.toString()) }
    var feedback by remember { mutableStateOf("") }
    var permissionEpoch by remember { mutableIntStateOf(0) }
    val owner = LocalLifecycleOwner.current
    val notificationsAllowed = remember(permissionEpoch) { CourseReminderNotifications.allowed(context) }
    val exactAllowed = remember(permissionEpoch) { ReminderScheduler.exactAllowed(context) }
    val promotedAllowed = remember(permissionEpoch) {
        Build.VERSION.SDK_INT >= 36 && context.getSystemService(NotificationManager::class.java).canPostPromotedNotifications()
    }
    fun update(next: ReminderSettings) {
        runCatching { preferences.save(next) }.onSuccess {
            settings = next
            ReminderScheduler.refreshAsync(context)
        }.onFailure { feedback = "提醒设置未保存，请重试" }
    }
    fun openSystem(intent: Intent) {
        runCatching { context.startActivity(intent) }.onFailure {
            feedback = "请在系统设置的小交课表页面开启相应权限"
        }
    }
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        permissionEpoch++
        feedback = if (it) "通知已开启，可继续开启准时提醒" else "通知未开启，可在系统设置中允许"
        ReminderScheduler.refreshAsync(context)
    }
    DisposableEffect(owner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                permissionEpoch++
                ReminderScheduler.refreshAsync(context)
            }
        }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }
    AlertDialog(onDismissRequest = onDismiss, title = { Text("课程提醒") },
        text = {
            Column(Modifier.fillMaxWidth().heightIn(max = 520.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("开启课前提醒", Modifier.weight(1f))
                    Switch(checked = settings.enabled, onCheckedChange = { enabled ->
                        preferences.introduced()
                        update(settings.copy(enabled = enabled))
                        if (enabled && !notificationsAllowed && Build.VERSION.SDK_INT >= 33)
                            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                    })
                }
                Text("提前多久", fontSize = 13.sp)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    listOf(5, 10, 15, 30, 45, 60).forEach { value ->
                        FilterChip(selected = settings.leadMinutes == value, onClick = {
                            minutes = value.toString()
                            update(settings.copy(leadMinutes = value))
                        }, label = { Text("$value 分钟") })
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(minutes, { minutes = it.filter(Char::isDigit).take(3) },
                        label = { Text("自定义：0–180 分钟") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f))
                    TextButton(onClick = {
                        val value = minutes.toIntOrNull()
                        if (value == null || value !in 0..180) feedback = "请输入 0–180 分钟"
                        else { update(settings.copy(leadMinutes = value)); feedback = "已设为提前 $value 分钟" }
                    }) { Text("应用") }
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("连堂只提醒一次", Modifier.weight(1f), fontSize = 14.sp)
                    Switch(checked = settings.mergeConsecutive,
                        onCheckedChange = { update(settings.copy(mergeConsecutive = it)) })
                }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("课程实时通知", Modifier.weight(1f), fontSize = 14.sp)
                    Switch(checked = settings.liveEnabled,
                        onCheckedChange = { update(settings.copy(liveEnabled = it)) })
                }
                Text("课前显示上课倒计时，上课后显示下课倒计时；课程结束自动收起。",
                    fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                HorizontalDivider()
                Text("通知：${if (notificationsAllowed) "已允许" else "未允许"} · 准时提醒：${if (exactAllowed) "已允许" else "未允许"}",
                    fontSize = 12.sp)
                if (!notificationsAllowed) TextButton(onClick = {
                    openSystem(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
                }) { Text("允许通知") }
                TextButton(onClick = { openSystem(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)) }) { Text("通知、声音与锁屏设置") }
                if (!exactAllowed && Build.VERSION.SDK_INT >= 31) {
                    Text("允许“闹钟和提醒”后才能在设定时刻提醒；未允许时系统可能延迟。", fontSize = 12.sp)
                    TextButton(onClick = { openSystem(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:${context.packageName}"))) }) { Text("允许准时提醒") }
                }
                if (Build.VERSION.SDK_INT >= 36) {
                    Text("状态栏实时通知：${if (promotedAllowed) "已允许" else "由系统设置控制"}", fontSize = 12.sp)
                    TextButton(onClick = { openSystem(Intent(Settings.ACTION_APP_NOTIFICATION_PROMOTION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)) }) { Text("状态栏实时通知设置") }
                }
                Text("灵动岛样式由手机系统决定；不支持时使用通知栏卡片。", fontSize = 12.sp)
                Text(manufacturerHint(Build.MANUFACTURER), fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = { openSystem(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:${context.packageName}"))) }) { Text("后台运行与自启动设置") }
                Text("提醒在手机本地运行，无需联网。系统强行停止 App 后，请重新打开一次。", fontSize = 12.sp)
                if (feedback.isNotBlank()) Text(feedback, fontSize = 12.sp)
                TextButton(onClick = {
                    if (!CourseReminderNotifications.allowed(context)) feedback = "请先允许通知"
                    else {
                        CourseReminderNotifications.preview(context, settings)
                        Toast.makeText(context, "已发送测试通知，约一分钟后自动收起", Toast.LENGTH_SHORT).show()
                    }
                }) { Text("发送测试通知") }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("完成") } },
    )
}

private fun manufacturerHint(manufacturer: String): String = when (manufacturer.lowercase()) {
    "xiaomi", "redmi" -> "小米 / Redmi：允许自启动，并将后台省电设置为无限制；超级岛需要系统与厂商支持。"
    "oppo", "oneplus", "realme" -> "OPPO / 一加 / realme：允许自启动和后台活动，避免系统休眠小交课表。"
    "vivo", "iqoo" -> "vivo / iQOO：允许自启动与后台运行，必要时允许后台高耗电运行。"
    "huawei", "honor" -> "华为 / 荣耀：在应用启动管理中允许自启动、关联启动和后台活动。"
    "samsung" -> "三星：将小交课表加入不会自动休眠的应用。"
    else -> "若提醒延迟，请在系统中允许小交课表后台运行，并关闭针对它的省电限制。"
}
