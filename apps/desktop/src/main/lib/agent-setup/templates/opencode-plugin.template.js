{{MARKER}}
/**
 * Superset Notification Plugin for OpenCode
 *
 * This plugin sends desktop notifications when OpenCode sessions need attention.
 * It hooks into session.status (busy/idle), session.idle, session.error, and permission.ask events.
 *
 * ROBUSTNESS FEATURES (v9):
 * - Session-scoped: Tracks root sessionID, ignores events from other sessions
 * - Deduplication: Only sends Start on idle→busy, Stop on busy→idle transitions
 * - Safe defaults: On error, assumes child session to avoid false positives
 * - Debug logging: Set SUPERSET_DEBUG=1 to enable verbose logging
 *
 * SUBAGENT FILTERING:
 * When using oh-my-opencode or similar tools that spawn background subagents
 * (e.g., explore, librarian, oracle agents), each subagent runs in its own
 * OpenCode session. These child sessions emit session.idle events when they
 * complete, which would cause excessive notifications if not filtered.
 *
 * We detect child sessions by checking the `parentID` field - main/root sessions
 * have `parentID` as undefined, while child sessions have it set.
 *
 * @see https://github.com/sst/opencode/blob/dev/packages/app/src/context/notification.tsx
 */
export const SupersetNotifyPlugin = async ({ $, client }) => {
  if (globalThis.__supersetOpencodeNotifyPluginV9) return {};
  globalThis.__supersetOpencodeNotifyPluginV9 = true;

  // Only run inside a Superset terminal session
  if (!process?.env?.SUPERSET_TAB_ID) return {};

  const notifyPath = process?.env?.SUPERSET_NOTIFY_PATH;
  if (!notifyPath) return {};
  const debug = process?.env?.SUPERSET_DEBUG === '1';

  // State tracking for deduplication and session-scoping
  let currentState = 'idle'; // 'idle' | 'busy'
  let rootSessionID = null;  // The session we're tracking (first busy session)
  let stopSent = false;      // Prevent duplicate Stop notifications

  const log = (...args) => {
    if (debug) console.log('[superset-plugin]', ...args);
  };

  /**
   * Sends a notification to Superset's notification server.
   * Best-effort only - failures are silently ignored to avoid breaking the agent.
   */
  const notify = async (hookEventName) => {
    const payload = JSON.stringify({ hook_event_name: hookEventName });
    log('Sending notification:', hookEventName);
    try {
      await $`bash ${notifyPath} ${payload}`;
      log('Notification sent successfully');
    } catch (err) {
      log('Notification failed:', err?.message || err);
    }
  };

  /**
   * Checks if a session is a child/subagent session by looking up its parentID.
   * Uses caching to avoid repeated lookups for the same session.
   *
   * IMPORTANT: On error, returns TRUE (assumes child) to avoid false positives.
   * This prevents race conditions where a failed lookup causes child session
   * events to be treated as root session events.
   */
  const childSessionCache = new Map();
  const isChildSession = async (sessionID) => {
    if (!sessionID) return true; // No sessionID = can't verify, skip
    if (!client?.session?.list) return true; // Can't check, skip

    // Check cache first
    if (childSessionCache.has(sessionID)) {
      return childSessionCache.get(sessionID);
    }

    try {
      const sessions = await client.session.list();
      const session = sessions.data?.find((s) => s.id === sessionID);
      const isChild = !!session?.parentID;
      childSessionCache.set(sessionID, isChild);
      log('Session lookup:', sessionID, 'isChild:', isChild);
      return isChild;
    } catch (err) {
      log('Session lookup failed:', err?.message || err, '- assuming child');
      // On error, assume child session to avoid false positives
      // This prevents race conditions where failures cause incorrect notifications
      return true;
    }
  };

  /**
   * Handles state transition to busy.
   * Only sends Start if transitioning from idle and session matches root.
   */
  const handleBusy = async (sessionID) => {
    // If we don't have a root session yet, this becomes our root
    if (!rootSessionID) {
      rootSessionID = sessionID;
      log('Root session set:', rootSessionID);
    }

    // Only process events for our root session
    if (sessionID !== rootSessionID) {
      log('Ignoring busy from non-root session:', sessionID);
      return;
    }

    // Only send Start if transitioning from idle
    if (currentState === 'idle') {
      currentState = 'busy';
      stopSent = false; // Reset stop flag for new busy period
      await notify('Start');
    } else {
      log('Already busy, skipping Start');
    }
  };

  /**
   * Handles state transition to idle/stopped.
   * Only sends Stop once per busy period and only for root session.
   * Resets rootSessionID after Stop so we can track new sessions.
   */
  const handleStop = async (sessionID, reason) => {
    // Only process events for our root session (if we have one)
    if (rootSessionID && sessionID !== rootSessionID) {
      log('Ignoring stop from non-root session:', sessionID, 'reason:', reason);
      return;
    }

    // Only send Stop if we're busy and haven't already sent Stop
    if (currentState === 'busy' && !stopSent) {
      currentState = 'idle';
      stopSent = true;
      log('Stopping, reason:', reason);
      await notify('Stop');
      // Reset rootSessionID so we can track a new session if OpenCode starts another conversation
      rootSessionID = null;
      log('Reset rootSessionID for next session');
    } else {
      log('Skipping Stop - state:', currentState, 'stopSent:', stopSent, 'reason:', reason);
    }
  };

  return {
    event: async ({ event }) => {
      const sessionID = event.properties?.sessionID;
      log('Event:', event.type, 'sessionID:', sessionID);

      // Skip notifications for child/subagent sessions
      if (await isChildSession(sessionID)) {
        log('Skipping child session');
        return;
      }

      // Handle session status changes (busy/idle/retry)
      if (event.type === "session.status") {
        const status = event.properties?.status;
        log('Status:', status?.type);
        if (status?.type === "busy") {
          await handleBusy(sessionID);
        } else if (status?.type === "idle") {
          await handleStop(sessionID, 'session.status.idle');
        }
      }

      // Handle deprecated/alternative event types (backwards compatibility)
      // Some OpenCode versions may emit session.busy/session.idle as separate events
      if (event.type === "session.busy") {
        await handleBusy(sessionID);
      }
      if (event.type === "session.idle") {
        await handleStop(sessionID, 'session.idle');
      }

      // Handle session errors (also means session stopped)
      if (event.type === "session.error") {
        await handleStop(sessionID, 'session.error');
      }
    },
    "permission.ask": async (_permission, output) => {
      if (output.status === "ask") {
        await notify("PermissionRequest");
      }
    },
  };
};
