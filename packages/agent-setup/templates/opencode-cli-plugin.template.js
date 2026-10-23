{{MARKER}}
/**
 * Superset Notification Plugin for OpenCode V2 (CLI plugin).
 *
 * V2 runs server plugins in one background service shared by every terminal,
 * so only the TUI process knows its SUPERSET_TERMINAL_ID. This plugin runs in
 * the TUI and keeps the v11 semantics of the V1 plugin:
 * - root sessions only: subagent (child) sessions are ignored;
 * - Start only on idle→busy, one Stop or Failed per busy period;
 * - the root stays bound while idle.
 *
 * The service streams events for the sessions of all TUIs. A busy period
 * starts only for the root of the session this TUI shows.
 */
import { spawn } from "node:child_process";

const notifyPath = "{{NOTIFY_PATH}}";

export default {
  id: "superset.notify",
  setup(context) {
    if (!process.env.SUPERSET_TERMINAL_ID) return;

    const debug = process.env.SUPERSET_DEBUG === "1";
    const log = (...args) => {
      if (debug) console.log("[superset-plugin]", ...args);
    };

    let currentState = "idle"; // 'idle' | 'busy'
    let rootSessionID = null; // Retained while idle for the host's resume binding
    let stopSent = false;

    // sessionID -> parentID, or null for a root session.
    const parentOf = new Map();
    const parentIDOf = (sessionID) => {
      if (parentOf.has(sessionID)) return parentOf.get(sessionID);
      const session = context.data.session.get(sessionID);
      // An unknown session is not proof of a root.
      if (!session) return undefined;
      const parentID = session.parentID ?? null;
      parentOf.set(sessionID, parentID);
      return parentID;
    };
    const isRoot = (sessionID) => parentIDOf(sessionID) === null;
    const rootOf = (sessionID) => {
      let current = sessionID;
      for (let depth = 0; depth < 32 && current; depth++) {
        const parentID = parentIDOf(current);
        if (parentID === undefined) return undefined;
        if (parentID === null) return current;
        current = parentID;
      }
      return undefined;
    };
    const isViewed = (sessionID) => {
      const route = context.ui.router.current();
      return route?.type === "session" && rootOf(route.sessionID) === sessionID;
    };

    const runNotify = (payload) =>
      new Promise((resolve) => {
        try {
          // Preserve the outer wrapper's identity. notify.sh drops this event
          // when OpenCode runs under another harness.
          const child = spawn("bash", [notifyPath, payload], {
            env: { ...process.env, SUPERSET_HOOK_HARNESS: "opencode" },
            stdio: "ignore",
          });
          child.on("error", (err) => {
            log("Notification failed:", err?.message || err);
            resolve();
          });
          child.on("close", () => resolve());
        } catch (err) {
          log("Notification failed:", err?.message || err);
          resolve();
        }
      });

    const notify = async (hookEventName, sessionID = rootSessionID, message) => {
      // An event from a different root must not replace the active session's
      // identity or end its binding (the host uses this ID for native resume).
      if (rootSessionID && sessionID && sessionID !== rootSessionID) return;
      const payload = JSON.stringify({
        hook_event_name: hookEventName,
        ...(typeof message === "string" && message.trim()
          ? { message: message.slice(0, 4000) }
          : {}),
        ...(sessionID ? { session_id: sessionID } : {}),
      });
      log("Sending notification:", hookEventName);
      await runNotify(payload);
    };

    const handleBusy = async (sessionID) => {
      // A new busy root after an idle turn is a conversation switch. The
      // retained root is checked too: another TUI can resume it.
      if (!rootSessionID || currentState === "idle") {
        if (!(isRoot(sessionID) && isViewed(sessionID))) {
          log("Ignoring busy from a session this TUI does not show:", sessionID);
          return;
        }
        rootSessionID = sessionID;
      }
      if (sessionID !== rootSessionID) return;
      if (currentState === "idle") {
        currentState = "busy";
        stopSent = false;
        await notify("Start", sessionID);
      }
    };

    const handleStop = async (sessionID, hookEventName, message) => {
      if (sessionID !== rootSessionID) return;
      if (currentState === "busy" && !stopSent) {
        currentState = "idle";
        stopSent = true;
        await notify(hookEventName, sessionID, message);
      }
    };

    const handlePermission = async (sessionID) => {
      if (!sessionID || !isRoot(sessionID)) return;
      const ownsBusyRoot = sessionID === rootSessionID && currentState === "busy";
      if (!ownsBusyRoot && !isViewed(sessionID)) return;
      await notify("PermissionRequest", sessionID);
    };

    // Keep ownership transitions and their notifications in arrival order.
    let pendingEvent = Promise.resolve();
    const enqueue = (handle) => {
      pendingEvent = pendingEvent.then(handle).catch((err) => {
        log("Event handling failed:", err?.message || err);
      });
      return pendingEvent;
    };

    const handleEvent = async ({ type, data }) => {
      if (type === "form.created") {
        await handlePermission(data?.form?.sessionID);
        return;
      }
      const sessionID = data?.sessionID;
      if (!sessionID) return;
      switch (type) {
        case "session.created": {
          const parentID = data.parentID ?? null;
          parentOf.set(sessionID, parentID);
          if (parentID !== null) return;
          if (rootSessionID && rootSessionID !== sessionID) return;
          if (!rootSessionID && !isViewed(sessionID)) return;
          rootSessionID = sessionID;
          await notify("SessionStart", sessionID);
          return;
        }
        case "session.deleted":
          if (sessionID === rootSessionID) {
            await notify("SessionEnd", sessionID);
            rootSessionID = null;
            currentState = "idle";
            stopSent = true;
          }
          parentOf.delete(sessionID);
          return;
        case "session.execution.started":
          await handleBusy(sessionID);
          return;
        case "session.execution.succeeded":
        case "session.execution.interrupted":
          await handleStop(sessionID, "Stop");
          return;
        case "session.execution.failed":
          await handleStop(
            sessionID,
            "Failed",
            data.error?.message ?? data.error?.data?.message,
          );
          return;
        case "permission.asked":
          await handlePermission(sessionID);
          return;
      }
    };

    return context.data.listen(({ details }) => {
      if (details) return enqueue(() => handleEvent(details));
    });
  },
};
