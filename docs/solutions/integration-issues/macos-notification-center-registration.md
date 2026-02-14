---
title: "macOS 26 Notification Center Registration"
category: integration-issues
tags: [electron, notifications, macos, notification-center]
module: Desktop
platform: macOS 26.x
symptom: "App missing from System Settings > Notifications, notifications not delivered"
root_cause: "No explicit registration with Notification Center on app startup"
solution: "Show silent notification at startup to trigger registration"
date: 2026-02-14
github_issue: 1461
---

# macOS 26 Notification Center Registration

## Problem

On macOS 26.x (Tahoe), the Superset desktop app was not appearing in **System Settings > Notifications**, causing:
- No notifications delivered when tasks complete
- No task status indicators (green progress bar) visible
- Users unable to configure notification preferences for the app

This issue affected macOS 26.2 specifically. Older macOS versions (13, 15) worked correctly.

## Root Cause

Electron's Notification API behaves differently from web browsers:

1. **No explicit permission API** - Unlike web's `Notification.requestPermission()`, Electron has no such method
2. **Implicit registration** - Registration with macOS Notification Center happens when `notification.show()` is called
3. **Missing trigger** - The app only checked `Notification.isSupported()` but never actually showed a notification
4. **macOS 26 changes** - New "Liquid Glass" notification architecture may require more explicit registration

### Key Misconceptions Corrected

| Assumption | Reality |
|------------|---------|
| Need entitlements for notifications | NOT required for notifications on macOS |
| `notification.on("error", ...)` exists | Only `failed` event exists (Windows only) |
| Permission prompt appears automatically | Registration is implicit via `show()` |

## Solution

Show a silent notification at app startup to force registration with macOS Notification Center. The notification is closed immediately after showing.

### Code

```typescript
// apps/desktop/src/main/windows/main.ts
// After notificationManager.start()

// Register with macOS Notification Center on startup
// This ensures the app appears in System Settings > Notifications
// Fixes https://github.com/superset-sh/superset/issues/1461
if (PLATFORM.IS_MAC && Notification.isSupported()) {
  const registrationNotification = new Notification({
    title: productName,
    body: " ",
    silent: true,
  });

  let handled = false;
  const cleanup = () => {
    if (handled) return;
    handled = true;
    registrationNotification.close();
  };

  registrationNotification.on("show", () => {
    cleanup();
    console.log("[notifications] Registered with Notification Center");
  });

  // Fallback timeout in case macOS doesn't fire events
  setTimeout(cleanup, 1000);

  registrationNotification.show();
}
```

### Why This Works

1. `notification.show()` triggers macOS Notification Center registration
2. The `show` event fires when notification is displayed
3. Cleanup closes the notification immediately (invisible to user)
4. App now appears in System Settings > Notifications
5. Future notifications work normally

## Files Modified

- `apps/desktop/src/main/windows/main.ts` - Added registration code (~25 lines)

## Testing

### Verification Steps

1. Launch the app on macOS 26.x
2. Open **System Settings > Notifications**
3. Confirm "Superset" appears in the application list
4. Run a task and verify notifications are delivered

### Test Checklist

- [ ] Fresh install test: Delete app, reinstall, verify registration
- [ ] Permission denied test: Disable notifications, verify graceful handling
- [ ] macOS regression test: Test on macOS 13/15 to ensure no breakage
- [ ] Do Not Disturb test: Enable Focus mode, verify notifications queue correctly

### Debug Mode

Enable extra logging for notification debugging:

```bash
SUPERSET_DEBUG=1 bun run desktop
```

## Prevention

### Code Review Points

1. **Never use `notification.on("error", ...)`** - This event doesn't exist in Electron's Notification API
2. **Always use `productName`** - Avoid hardcoded app name strings
3. **Include fallback timeout** - Ensures cleanup even if events don't fire
4. **Use `handled` flag** - Prevents double cleanup scenarios

### Electron Notification Events Reference

| Event | Platform | Description |
|-------|----------|-------------|
| `show` | All | Emitted when notification is displayed |
| `click` | All | User clicked notification |
| `close` | All | Notification closed |
| `failed` | Windows only | Error during show |
| `action` | macOS | Button click |
| `reply` | macOS | Inline reply |

## Related Issues

- [GitHub #1461](https://github.com/superset-sh/superset/issues/1461) - Original bug report

## References

- [Electron Notification API](https://www.electronjs.org/docs/latest/api/notification)
- [Electron Notifications Tutorial](https://www.electronjs.org/docs/latest/tutorial/notifications)

## Notes

- The related macOS 26.3 "non-stop notifications" issue is a separate bug in notification deduplication logic
- No entitlements changes were required for this fix
- Content sanitization could be added if sensitive data appears in notifications (fix data flow, not display)