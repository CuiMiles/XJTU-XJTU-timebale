package io.github.cuimiles.xiaojiao

enum class ReminderPermissionStep { NOTIFICATION_REQUEST, NOTIFICATION_SETTINGS, EXACT_SETTINGS, READY }

/** Called only for a user-initiated flow; declining a prompt stops that flow. */
object ReminderPermissionPolicy {
    fun next(runtimePermissionMissing: Boolean, notificationsAllowed: Boolean, exactAllowed: Boolean,
        notificationRequestBlocked: Boolean): ReminderPermissionStep = when {
        runtimePermissionMissing && !notificationRequestBlocked -> ReminderPermissionStep.NOTIFICATION_REQUEST
        !notificationsAllowed -> ReminderPermissionStep.NOTIFICATION_SETTINGS
        !exactAllowed -> ReminderPermissionStep.EXACT_SETTINGS
        else -> ReminderPermissionStep.READY
    }
}
