package io.github.cuimiles.xiaojiao

import org.junit.Assert.assertEquals
import org.junit.Test

class ReminderPermissionPolicyTest {
    @Test fun firstEnableRequestsNotificationsBeforeLegacyAlarmAccess() {
        assertEquals(ReminderPermissionStep.NOTIFICATION_REQUEST,
            ReminderPermissionPolicy.next(true, false, false, false))
    }

    @Test fun permanentDenialRoutesToSettingsInsteadOfRepeatingSilentRequests() {
        assertEquals(ReminderPermissionStep.NOTIFICATION_SETTINGS,
            ReminderPermissionPolicy.next(true, false, true, true))
    }

    @Test fun disabledChannelRequiresSettingsEvenWithRuntimePermission() {
        assertEquals(ReminderPermissionStep.NOTIFICATION_SETTINGS,
            ReminderPermissionPolicy.next(false, false, true, false))
    }

    @Test fun legacyExactAccessIsRequestedAfterNotifications() {
        assertEquals(ReminderPermissionStep.EXACT_SETTINGS,
            ReminderPermissionPolicy.next(false, true, false, false))
    }

    @Test fun existingPermissionsSkipAllPrompts() {
        assertEquals(ReminderPermissionStep.READY,
            ReminderPermissionPolicy.next(false, true, true, true))
    }
}
