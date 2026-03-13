import {
	buildWrapperScript,
	createWrapper,
} from "./agent-wrappers-common";
import { getNotifyScriptPath } from "./notify-hook";

/**
 * OpenClaw agent wrapper.
 *
 * OpenClaw is a personal AI agent platform that runs as a gateway daemon
 * with a TUI (terminal UI) interface. It has its own internal hook system
 * (message:received / message:sent events) that can fire Superset lifecycle
 * notifications directly. The wrapper ensures the Superset environment
 * variables (SUPERSET_PANE_ID, SUPERSET_TAB_ID, SUPERSET_WORKSPACE_ID,
 * SUPERSET_PORT) are forwarded so OpenClaw hooks can reach the notification
 * server.
 *
 * OpenClaw's hook system can be configured to call the Superset notification
 * endpoint on message:received (Start) and message:sent (Stop), providing
 * real-time sidebar status without needing a wrapper-level notify hook.
 *
 * @see https://docs.openclaw.ai
 * @see https://github.com/openclaw/openclaw
 */
export function createOpenClawWrapper(): void {
	const notifyPath = getNotifyScriptPath();

	// OpenClaw TUI is the primary interface. The wrapper passes through
	// all args and ensures Superset env vars are available for OpenClaw's
	// internal hook system to fire lifecycle events.
	//
	// OpenClaw can also use the notify hook directly via its hooks.internal
	// system (message:received → Start, message:sent → Stop), so the
	// wrapper primarily ensures the binary is found and env is set up.
	const execLine = `# OpenClaw has its own lifecycle hook system that can call Superset's
# notification endpoint directly. The SUPERSET_* env vars are inherited
# automatically from the terminal session.
#
# To enable OpenClaw → Superset lifecycle hooks, create an OpenClaw hook:
#   ~/.openclaw/hooks/superset-lifecycle/handler.ts
# that fires Start/Stop to http://127.0.0.1:$SUPERSET_PORT/hook/complete
#
# For agents that don't have native hook support, the notify script can
# be called manually:
#   ${notifyPath}
export OPENCLAW_NOTIFY_HOOK="${notifyPath}"
exec "$REAL_BIN" "$@"`;

	const script = buildWrapperScript("openclaw", execLine);
	createWrapper("openclaw", script);
}
