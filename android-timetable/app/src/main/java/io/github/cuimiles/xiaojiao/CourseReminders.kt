package io.github.cuimiles.xiaojiao

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors

class ReminderPreferences(context: Context) {
    private val preferences = context.getSharedPreferences("course_reminders", Context.MODE_PRIVATE)
    fun load() = ReminderSettings(
        preferences.getBoolean("enabled", false),
        preferences.getInt("lead_minutes", 30).coerceIn(0, 180),
        preferences.getBoolean("live_enabled", true),
        preferences.getBoolean("merge_consecutive", false),
    )
    fun save(settings: ReminderSettings) {
        require(settings.leadMinutes in 0..180)
        check(preferences.edit().putBoolean("enabled", settings.enabled)
            .putInt("lead_minutes", settings.leadMinutes).putBoolean("live_enabled", settings.liveEnabled)
            .putBoolean("merge_consecutive", settings.mergeConsecutive).commit())
    }
    fun activeKeys(): Set<String> = preferences.getStringSet("active_keys", emptySet()).orEmpty().toSet()
    fun activeKeys(keys: Set<String>) { preferences.edit().putStringSet("active_keys", keys).apply() }
    fun renderedLive(): Boolean = preferences.getBoolean("rendered_live", true)
    fun renderedLive(value: Boolean) { preferences.edit().putBoolean("rendered_live", value).apply() }
    fun dismissedKeys(): Set<String> = preferences.getStringSet("dismissed_keys", emptySet()).orEmpty().toSet()
    fun dismissedKeys(keys: Set<String>) { preferences.edit().putStringSet("dismissed_keys", keys).apply() }
    fun shouldIntroduce(): Boolean = !preferences.getBoolean("introduced", false)
    fun introduced() { preferences.edit().putBoolean("introduced", true).apply() }
    fun requestedNotifications(): Boolean = preferences.getBoolean("notification_requested", false)
    fun markNotificationsRequested() { preferences.edit().putBoolean("notification_requested", true).apply() }
}

object CourseReminderNotifications {
    const val CHANNEL = "course_reminders_v1"
    private const val ID = 4100

    fun allowed(context: Context): Boolean =
        (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context,
            Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
            NotificationManagerCompat.from(context).areNotificationsEnabled() &&
            context.getSystemService(NotificationManager::class.java).getNotificationChannel(CHANNEL)
                ?.importance != NotificationManager.IMPORTANCE_NONE

    fun createChannel(context: Context) {
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "课程提醒", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "课前提醒、上课时间和课程实时通知"
                enableVibration(true)
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            })
    }

    fun cancel(context: Context, key: String) {
        context.getSystemService(NotificationManager::class.java).cancel(key, ID)
    }

    fun show(context: Context, lesson: ReminderLesson, settings: ReminderSettings, now: Long, alert: Boolean,
        timeout: Long = lesson.endAt - now) {
        if (!allowed(context)) return
        val ongoing = settings.liveEnabled
        val upcoming = now < lesson.startAt
        val target = if (upcoming) lesson.startAt else lesson.endAt
        val range = "${ReminderPlan.timeText(lesson.startAt)}–${ReminderPlan.timeText(lesson.endAt)}"
        val sections = if (lesson.sections.size == 1) "第 ${lesson.sections.first()} 节"
            else "第 ${lesson.sections.first()}–${lesson.sections.last()} 节"
        val place = lesson.room.ifBlank { "地点未填写" }
        val status = if (upcoming) "即将上课" else "正在上课"
        val open = PendingIntent.getActivity(context, 0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val dismiss = PendingIntent.getBroadcast(context, 0,
            Intent(context, CourseReminderReceiver::class.java).apply {
                action = ReminderScheduler.ACTION_DISMISS
                data = android.net.Uri.parse("xiaojiao://reminder/${lesson.key}")
            }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val base = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_course_notification)
            .setContentTitle(lesson.title)
            .setContentText("$range · $place")
            .setSubText("$status · $sections")
            .setStyle(NotificationCompat.BigTextStyle().bigText("$status · $range\n$place · $sections"))
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(open)
            .setWhen(target).setShowWhen(true)
            .setUsesChronometer(ongoing).setChronometerCountDown(ongoing)
            .setOngoing(ongoing).setAutoCancel(!ongoing)
            // Android 16.0's eligibility check uses EXTRA_COLORIZED; 36.1 changed to the request extra.
            .setColorized(ongoing && Build.VERSION.SDK_INT >= 36 && Build.VERSION.SDK_INT_FULL < 3_600_001)
            .setOnlyAlertOnce(true).setSilent(!alert)
            .setTimeoutAfter(timeout.coerceAtLeast(1))
            .addAction(0, "收起", dismiss)
            .build()
        val notification = if (Build.VERSION.SDK_INT >= 36 && ongoing) {
            Notification.Builder.recoverBuilder(context, base)
                // Official extra also works on Android 16 builds predating the 36.1 builder method.
                .addExtras(android.os.Bundle().apply { putBoolean("android.requestPromotedOngoing", true) })
                .setShortCriticalText(lesson.title.take(2) + ReminderPlan.timeText(target))
                .build()
        } else base
        try {
            context.getSystemService(NotificationManager::class.java).notify(lesson.key, ID, notification)
        } catch (_: SecurityException) { /* Permissions can be revoked between checking and posting. */ }
    }

    fun preview(context: Context, settings: ReminderSettings) {
        createChannel(context)
        val now = System.currentTimeMillis()
        show(context, ReminderLesson("preview", "课程提醒测试", "示例教室", listOf(3),
            now + 10 * 60_000, now + 60 * 60_000, now), settings, now, true, timeout = 60_000)
    }
}

/** Keeps one local alarm for the next reminder/start/end; never polls the network or holds a service. */
object ReminderScheduler {
    const val ACTION_REFRESH = "io.github.cuimiles.xiaojiao.REMINDER_REFRESH"
    const val ACTION_DISMISS = "io.github.cuimiles.xiaojiao.REMINDER_DISMISS"
    private val executor = Executors.newSingleThreadExecutor()
    private val lock = Any()

    fun exactAllowed(context: Context): Boolean = Build.VERSION.SDK_INT < 31 ||
        context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

    fun refreshAsync(context: Context) {
        val app = context.applicationContext
        executor.execute { runCatching { refresh(app) } }
    }

    fun receive(context: Context, result: BroadcastReceiver.PendingResult, action: String?, key: String?) {
        val app = context.applicationContext
        executor.execute {
            try {
                runCatching { synchronized(lock) {
                    if (action == ACTION_DISMISS && key != null) {
                        val prefs = ReminderPreferences(app)
                        prefs.dismissedKeys(prefs.dismissedKeys() + key)
                        CourseReminderNotifications.cancel(app, key)
                    }
                    refresh(app, alert = action == ACTION_REFRESH)
                } }
            } finally { result.finish() }
        }
    }

    fun refresh(context: Context, alert: Boolean = false) = synchronized(lock) {
        val prefs = ReminderPreferences(context)
        val settings = prefs.load()
        val alarms = context.getSystemService(AlarmManager::class.java)
        val pending = PendingIntent.getBroadcast(context, 4100,
            Intent(context, CourseReminderReceiver::class.java).setAction(ACTION_REFRESH),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        alarms.cancel(pending)
        CourseReminderNotifications.createChannel(context)
        val data = try { ScheduleRepository(context).load() } catch (_: Exception) {
            // Do not turn an unreadable timetable into an empty plan; a later open/save can recover it.
            return@synchronized
        }
        val lessons = ReminderPlan.lessons(data, settings)
        val now = System.currentTimeMillis()
        val visible = lessons.filter { it.visibleAt(now) }
        val keys = visible.map { it.key }.toSet()
        val dismissed = prefs.dismissedKeys().intersect(keys)
        prefs.dismissedKeys(dismissed)
        val oldKeys = prefs.activeKeys()
        val modeChanged = prefs.renderedLive() != settings.liveEnabled
        (oldKeys - keys).forEach { CourseReminderNotifications.cancel(context, it) }
        if (!settings.enabled || !CourseReminderNotifications.allowed(context)) {
            oldKeys.forEach { CourseReminderNotifications.cancel(context, it) }
            prefs.activeKeys(emptySet())
            return@synchronized
        }
        visible.filter { it.key !in dismissed }.forEach { lesson ->
            if (settings.liveEnabled || lesson.key !in oldKeys || modeChanged) {
                CourseReminderNotifications.show(context, lesson, settings, now,
                    alert && lesson.key !in oldKeys && now <= lesson.startAt + 60_000)
            }
        }
        prefs.activeKeys(keys)
        prefs.renderedLive(settings.liveEnabled)
        val next = ReminderPlan.nextChange(lessons, now, settings.liveEnabled) ?: return@synchronized
        try {
            if (exactAllowed(context)) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
            else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
        } catch (_: SecurityException) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending)
        }
    }
}

class CourseReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in setOf(ReminderScheduler.ACTION_REFRESH, ReminderScheduler.ACTION_DISMISS)) return
        ReminderScheduler.receive(context, goAsync(), intent.action, intent.data?.lastPathSegment)
    }
}

class ReminderRestoreReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED,
                Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED,
                AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED)) return
        ReminderScheduler.receive(context, goAsync(), intent.action, null)
    }
}
