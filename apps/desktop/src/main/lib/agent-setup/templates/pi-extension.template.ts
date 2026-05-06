{{MARKER}}
/**
 * Superset Notification Extension for pi
 *
 * Emits Claude-Code-compatible lifecycle hooks to Superset's notify.sh so
 * the host UI gets a "working" indicator (and completion chime) for pi
 * sessions, the same way it does for Claude Code, Codex, etc.
 *
 * Mapping:
 *   pi `before_agent_start`  → Claude `UserPromptSubmit`  → Superset `Start`
 *   pi `tool_execution_end`  → Claude `PostToolUse`       → progress signal
 *   pi `agent_end`           → Claude `Stop`              → completion / chime
 *   pi `session_shutdown`    → Claude `Stop`              → cleanup on quit/reload
 *
 * Activates only when running inside a Superset terminal (detected via
 * SUPERSET_TERMINAL_ID / SUPERSET_TAB_ID / SUPERSET_PANE_ID). Outside
 * Superset it's a complete no-op. If notify.sh is missing it's also a
 * no-op (Superset uninstalled / never installed).
 *
 * Hook dispatch is fire-and-forget: failures to spawn or curl never
 * affect the agent loop. notify.sh has its own connect/max timeouts.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export default function (pi: ExtensionAPI) {
	// Only activate inside a Superset terminal. Both v2 (host-service) and
	// v1 (electron localhost) shells set at least one of these.
	const insideSuperset = Boolean(
		process.env.SUPERSET_TERMINAL_ID ||
			process.env.SUPERSET_TAB_ID ||
			process.env.SUPERSET_PANE_ID,
	);
	if (!insideSuperset) return;

	const supersetHome =
		process.env.SUPERSET_HOME_DIR || join(homedir(), ".superset");
	const notifyScript = join(supersetHome, "hooks", "notify.sh");
	if (!existsSync(notifyScript)) return;

	const fire = (eventName: string) => {
		try {
			const child = spawn(notifyScript, [], {
				stdio: ["pipe", "ignore", "ignore"],
				detached: true,
				env: process.env,
			});
			child.on("error", () => {
				/* swallow — never let hook failures affect pi */
			});
			child.stdin?.on("error", () => {
				/* swallow — happens if notify.sh exits before we finish writing */
			});
			child.stdin?.end(JSON.stringify({ hook_event_name: eventName }));
			child.unref();
		} catch {
			// spawn() can throw synchronously (EACCES, ENOENT). Stay silent.
		}
	};

	// Gate every hook on ctx.hasUI: when this is explicitly false (print
	// mode `-p`, JSON mode), pi is running as a subagent or non-interactive
	// helper and should NOT drive Superset's working indicator. Interactive
	// and RPC sessions (the user-facing ones) have hasUI=true.
	//
	// We deliberately check `=== false` rather than `!ctx.hasUI` so that pi
	// versions older than 0.38.0 (where `hasUI` did not yet exist) still
	// fire hooks. On those older versions subagent flicker is possible, but
	// that's a niche regression; on >=0.38.0 the gate works precisely.
	const skip = (ctx: { hasUI?: boolean }) => ctx.hasUI === false;

	pi.on("before_agent_start", (_event, ctx) => {
		if (skip(ctx)) return;
		fire("UserPromptSubmit");
	});

	pi.on("tool_execution_end", (_event, ctx) => {
		if (skip(ctx)) return;
		fire("PostToolUse");
	});

	pi.on("agent_end", (_event, ctx) => {
		if (skip(ctx)) return;
		fire("Stop");
	});

	// Ensure we mark the agent as "stopped" if pi is killed mid-run, so the
	// Superset working indicator doesn't get stuck on. Fires on Ctrl+C,
	// SIGTERM, SIGHUP, /quit, /reload, /new, /resume, /fork.
	pi.on("session_shutdown", (_event, ctx) => {
		if (skip(ctx)) return;
		fire("Stop");
	});
}
