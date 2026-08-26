{{MARKER}}
/**
 * Superset Notification Extension for Oh My Pi / OMP.
 *
 * Emits Claude-Code-compatible lifecycle hooks to Superset's notify.sh so the
 * host UI gets a truthful working/review indicator and completion chime for
 * OMP sessions, the same way it does for Claude Code, Codex, etc.
 *
 * Proven OMP status surface:
 *   - `session_start` / `session_end` identify an interactive UI session.
 *   - `agent_start` / `agent_end` bracket live agent work.
 *   - legacy Pi builds may emit `before_agent_start` instead of `agent_start`.
 *   - `tool_execution_end` is only a progress signal, not completion.
 *
 * Superset does not infer richer error state from session files: OMP has no
 * on-disk running/error field. Error/completion status is therefore limited to
 * live lifecycle events exposed to this extension.
 *
 * Mapping:
 *   OMP `session_start`       → Claude `SessionStart`      → Superset `Attached`
 *   OMP `agent_start`         → Claude `UserPromptSubmit`  → Superset `Start`
 *   Pi  `before_agent_start`  → Claude `UserPromptSubmit`  → Superset `Start`
 *   OMP `tool_execution_end`  → Claude `PostToolUse`       → progress signal
 *   OMP `agent_end`           → Claude `Stop`              → completion / chime
 *   OMP `session_end`         → Claude `SessionEnd`        → pane icon detach
 *   OMP `session_shutdown`    → Claude `Stop`              → cleanup on quit/reload
 *
 * Activates only when running inside a v2 Superset terminal (detected via
 * SUPERSET_TERMINAL_ID). Outside Superset it's a complete no-op. If notify.sh
 * is missing it's also a no-op (Superset uninstalled / never installed).
 *
 * Hook dispatch is fire-and-forget: failures to spawn or curl never affect the
 * agent loop. notify.sh has its own connect/max timeouts.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type OmpHookContext = { hasUI?: boolean };
type OmpHookHandler = (event: unknown, ctx: OmpHookContext | undefined) => void;

type OmpLifecycleEventName =
	| "session_start"
	| "session_end"
	| "agent_start"
	| "before_agent_start"
	| "tool_execution_end"
	| "agent_end"
	| "session_shutdown";

type SupersetHookEventName =
	| "SessionStart"
	| "SessionEnd"
	| "UserPromptSubmit"
	| "PostToolUse"
	| "Stop";

interface OmpExtensionApi {
	on(eventName: OmpLifecycleEventName, handler: OmpHookHandler): void;
}

export default function (pi: OmpExtensionApi) {
	// Only activate inside a v2 Superset terminal.
	if (!process.env.SUPERSET_TERMINAL_ID) return;

	const supersetHome =
		process.env.SUPERSET_HOME_DIR || join(homedir(), ".superset");
	const notifyScript = join(supersetHome, "hooks", "notify.sh");
	if (!existsSync(notifyScript)) return;

	const fire = (eventName: string) => {
		try {
			const child = spawn(notifyScript, [], {
				stdio: ["pipe", "ignore", "ignore"],
				detached: true,
				env: { ...process.env, SUPERSET_AGENT_ID: "omp" },
			});
			child.on("error", () => {
				/* swallow — never let hook failures affect OMP */
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
	// mode `-p`, JSON mode), OMP is running as a subagent or non-interactive
	// helper and should NOT drive Superset's working indicator. Interactive
	// and RPC sessions (the user-facing ones) have hasUI=true.
	//
	// We deliberately check `=== false` rather than `!ctx.hasUI` so that legacy
	// Pi builds where `hasUI` did not yet exist still fire hooks. On those older
	// versions subagent flicker is possible; on OMP versions with `hasUI`, the
	// gate works precisely.
	const skip = (ctx: OmpHookContext | undefined) => ctx?.hasUI === false;

	const lifecycleMappings = [
		// Earliest signal OMP is alive in this terminal. This binds the pane icon
		// without marking the pane as working; real work starts on `agent_start`.
		["session_start", "SessionStart"],
		["session_end", "SessionEnd"],
		["agent_start", "UserPromptSubmit"],
		// Legacy Pi compatibility: older extension surfaces used this name for the
		// same per-turn start signal.
		["before_agent_start", "UserPromptSubmit"],
		["tool_execution_end", "PostToolUse"],
		["agent_end", "Stop"],
		// Ensure we mark the agent as stopped if OMP is killed mid-run, so the
		// Superset working indicator doesn't get stuck on. Fires on Ctrl+C,
		// SIGTERM, SIGHUP, /quit, /reload, /new, /resume, /fork.
		["session_shutdown", "Stop"],
	] as const satisfies readonly (readonly [
		OmpLifecycleEventName,
		SupersetHookEventName,
	])[];

	for (const [eventName, hookEventName] of lifecycleMappings) {
		pi.on(eventName, (_event, ctx) => {
			if (skip(ctx)) return;
			fire(hookEventName);
		});
	}
}
