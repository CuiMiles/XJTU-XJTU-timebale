package io.github.cuimiles.xiaojiao

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
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
    var requestInProgress by rememberSaveable { mutableStateOf(false) }
    var pendingStep by rememberSaveable { mutableStateOf<String?>(null) }
    var previewAfterPermissions by rememberSaveable { mutableStateOf(false) }
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
    fun openSystem(vararg intents: Intent) {
        if (!ReminderSystemSettings.open(context, intents.toList() + ReminderSystemSettings.details(context)))
            feedback = "系统设置暂时无法打开，请稍后重试"
    }
    fun showPreview() {
        CourseReminderNotifications.preview(context, settings)
        Toast.makeText(context, "已发送测试通知，约一分钟后自动收起", Toast.LENGTH_SHORT).show()
    }
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        pendingStep = null
        permissionEpoch++
        if (!it) {
            requestInProgress = false
            previewAfterPermissions = false
            feedback = "通知未允许，点“一键开启提醒权限”可再次申请"
        }
        ReminderScheduler.refreshAsync(context)
    }
    val systemPermission = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        val step = pendingStep
        pendingStep = null
        permissionEpoch++
        if ((step == ReminderPermissionStep.NOTIFICATION_SETTINGS.name && !CourseReminderNotifications.allowed(context)) ||
            (step == ReminderPermissionStep.EXACT_SETTINGS.name && !ReminderScheduler.exactAllowed(context))) {
            requestInProgress = false
            previewAfterPermissions = false
            feedback = if (step == ReminderPermissionStep.EXACT_SETTINGS.name)
                "准时提醒未允许，系统提醒可能延迟；可稍后再次开启"
            else "通知仍未开启，可稍后再次申请"
        }
        ReminderScheduler.refreshAsync(context)
    }
    LaunchedEffect(requestInProgress, permissionEpoch) {
        // Resume updates status only; prompts are initiated by the switch or permission/test button.
        if (!requestInProgress || pendingStep != null) return@LaunchedEffect
        val missingRuntime = Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,
            Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        val activity = context.reminderActivity()
        val blocked = preferences.requestedNotifications() && activity != null &&
            !ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.POST_NOTIFICATIONS)
        val step = ReminderPermissionPolicy.next(missingRuntime, CourseReminderNotifications.allowed(context),
            ReminderScheduler.exactAllowed(context), blocked)
        if (step == ReminderPermissionStep.READY) {
            requestInProgress = false
            feedback = "通知与准时提醒已开启"
            if (previewAfterPermissions) { previewAfterPermissions = false; showPreview() }
            return@LaunchedEffect
        }
        pendingStep = step.name
        val launched = runCatching {
            when (step) {
                ReminderPermissionStep.NOTIFICATION_REQUEST -> {
                    preferences.markNotificationsRequested()
                    notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
                ReminderPermissionStep.NOTIFICATION_SETTINGS -> {
                    val intent = if (NotificationManagerCompat.from(context).areNotificationsEnabled() && !missingRuntime)
                        ReminderSystemSettings.channel(context) else ReminderSystemSettings.notifications(context)
                    systemPermission.launch(intent)
                }
                ReminderPermissionStep.EXACT_SETTINGS -> systemPermission.launch(
                    Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}")))
                ReminderPermissionStep.READY -> Unit
            }
        }.isSuccess
        if (!launched) {
            // Some OEMs remove a standard settings page. Open this app's own page as the fallback.
            val fallback = runCatching { systemPermission.launch(ReminderSystemSettings.details(context)) }.isSuccess
            if (!fallback) {
                pendingStep = null
                requestInProgress = false
                previewAfterPermissions = false
                feedback = "系统权限页面暂时无法打开，请稍后重试"
            }
        }
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
                        if (enabled) { feedback = ""; requestInProgress = true }
                        else { requestInProgress = false; previewAfterPermissions = false }
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
                    Text("通知栏倒计时", Modifier.weight(1f), fontSize = 14.sp)
                    Switch(checked = settings.liveEnabled,
                        onCheckedChange = { update(settings.copy(liveEnabled = it)) })
                }
                Text("课前显示上课倒计时，上课后显示下课倒计时；课程结束自动收起。",
                    fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                HorizontalDivider()
                Text("通知：${if (notificationsAllowed) "已允许" else "未允许"} · 准时提醒：${if (exactAllowed) "已允许" else "未允许"}",
                    fontSize = 12.sp)
                if (!notificationsAllowed || !exactAllowed) {
                    Button(onClick = { feedback = ""; requestInProgress = true }, enabled = pendingStep == null) {
                        Text("一键开启提醒权限")
                    }
                    Text("自动发起申请或直达权限页面，只需按系统提示确认。", fontSize = 12.sp)
                }
                TextButton(onClick = { openSystem(ReminderSystemSettings.channel(context),
                    ReminderSystemSettings.notifications(context)) }) { Text("通知、声音与锁屏设置") }
                if (!exactAllowed && Build.VERSION.SDK_INT >= 31) {
                    Text("允许“闹钟和提醒”后才能在设定时刻提醒；未允许时系统可能延迟。", fontSize = 12.sp)
                }
                if (Build.VERSION.SDK_INT >= 36) {
                    Text("Android 实时通知：${if (promotedAllowed) "已允许" else "由系统设置控制"}", fontSize = 12.sp)
                    TextButton(onClick = { openSystem(Intent(Settings.ACTION_APP_NOTIFICATION_PROMOTION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)) }) { Text("状态栏实时通知设置") }
                }
                Text("小交课表目前提供通知栏提醒，尚未接入厂商原子岛 / 超级岛。需要这类展示，可在应用商店查看 WakeUp 等主流课表；以其当前版本和手机适配情况为准。",
                    fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = {
                    if (!ReminderSystemSettings.open(context, listOf(
                        Intent(Intent.ACTION_VIEW, Uri.parse("market://search?q=${Uri.encode("WakeUp课程表")}")),
                        Intent(Intent.ACTION_VIEW, Uri.parse("https://www.wakeup.fun/")))))
                        feedback = "应用商店暂时无法打开，可搜索“WakeUp课程表”"
                }) { Text("查看 WakeUp 课程表") }
                Text(manufacturerHint(Build.MANUFACTURER), fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = {
                    if (!ReminderSystemSettings.open(context, ReminderSystemSettings.background(context)))
                        feedback = "系统后台设置暂时无法打开，请稍后重试"
                }) { Text("后台运行与自启动设置") }
                Text("提醒在手机本地运行，无需联网。系统强行停止 App 后，请重新打开一次。", fontSize = 12.sp)
                if (feedback.isNotBlank()) Text(feedback, fontSize = 12.sp)
                TextButton(onClick = {
                    if (!CourseReminderNotifications.allowed(context)) {
                        feedback = ""; previewAfterPermissions = true; requestInProgress = true
                    } else showPreview()
                }) { Text("发送测试通知") }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("完成") } },
    )
}

private fun Context.reminderActivity(): Activity? {
    var current = this
    while (current is ContextWrapper) {
        if (current is Activity) return current
        val base = current.baseContext
        if (base === current) break
        current = base
    }
    return current as? Activity
}

private fun manufacturerHint(manufacturer: String): String = when (manufacturer.lowercase()) {
    "xiaomi", "redmi" -> "小米 / Redmi：允许自启动，并将后台省电设置为无限制；超级岛需要系统与厂商支持。"
    "oppo", "oneplus", "realme" -> "OPPO / 一加 / realme：允许自启动和后台活动，避免系统休眠小交课表。"
    "vivo", "iqoo" -> "vivo / iQOO：允许自启动与后台运行，必要时允许后台高耗电运行。"
    "huawei", "honor" -> "华为 / 荣耀：在应用启动管理中允许自启动、关联启动和后台活动。"
    "samsung" -> "三星：将小交课表加入不会自动休眠的应用。"
    else -> "若提醒延迟，请在系统中允许小交课表后台运行，并关闭针对它的省电限制。"
}
