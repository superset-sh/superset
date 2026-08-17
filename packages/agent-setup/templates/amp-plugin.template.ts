{{MARKER}}
// @i-know-the-amp-plugin-api-is-wip-and-very-experimental-right-now

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

declare const process: {
	env?: Record<string, string | undefined>;
	stderr?: { write: (message: string) => void };
};

type AmpEventName = "session.start" | "agent.start" | "agent.end";
type AmpApi = {
	on: (
		eventName: AmpEventName,
		handler: (event?: unknown) => unknown | Promise<unknown>,
	) => void;
};
type SupersetGlobal = typeof globalThis & {
	__supersetAmpLifecyclePluginV1?: boolean;
};

function getStringProperty(
	value: Record<string, unknown>,
	keys: string[],
): string | undefined {
	for (const key of keys) {
		const property = value[key];
		if (typeof property === "string" && property.length > 0) {
			return property;
		}
	}
}

function getSessionId(event: unknown): string | undefined {
	if (!event || typeof event !== "object") return undefined;
	const record = event as Record<string, unknown>;
	const direct = getStringProperty(record, [
		"threadID",
		"threadId",
		"sessionID",
		"sessionId",
		"id",
	]);
	if (direct) return direct;

	const thread = record.thread;
	if (thread && typeof thread === "object") {
		return getStringProperty(thread as Record<string, unknown>, [
			"id",
			"threadID",
			"threadId",
		]);
	}
}

function isDebugEnabled(): boolean {
	const env = typeof process === "undefined" ? {} : process.env ?? {};
	return ["SUPERSET_DEBUG_HOOKS", "SUPERSET_DEBUG"].some((key) => {
		const value = env[key];
		return value === "1" || value === "true" || value === "TRUE";
	});
}

function debugLog(message: string): void {
	if (!isDebugEnabled()) return;
	process?.stderr?.write?.("[superset-amp-plugin] " + message + "\n");
}

export default function supersetAmpLifecyclePlugin(amp: AmpApi) {
	const supersetGlobal = globalThis as SupersetGlobal;
	if (supersetGlobal.__supersetAmpLifecyclePluginV1) return;
	supersetGlobal.__supersetAmpLifecyclePluginV1 = true;

	const env = typeof process === "undefined" ? {} : process.env ?? {};
	if (!env.SUPERSET_TERMINAL_ID && !env.SUPERSET_TAB_ID) {
		debugLog("disabled: missing Superset terminal env");
		return;
	}

	const supersetHome = env.SUPERSET_HOME_DIR || join(homedir(), ".superset");
	const notifyPath = join(supersetHome, "hooks", "notify.sh");
	if (!existsSync(notifyPath)) {
		debugLog("disabled: notify hook missing at " + notifyPath);
		return;
	}

	debugLog(
		"enabled terminalId=" +
			(env.SUPERSET_TERMINAL_ID || "") +
			" tabId=" +
			(env.SUPERSET_TAB_ID || "") +
			" notify=" +
			notifyPath,
	);

	const notify = (hookEventName: string, event?: unknown) => {
		const sessionId = getSessionId(event);
		const payload = JSON.stringify({
			hook_event_name: hookEventName,
			resourceId: sessionId,
			session_id: sessionId,
		});

		try {
			const child = spawn(notifyPath, [], {
				stdio: ["pipe", "ignore", "ignore"],
				detached: true,
				env: { ...env, SUPERSET_AGENT_ID: "amp" },
			});
			child.on("error", (error) => {
				debugLog("spawn failed event=" + hookEventName + " error=" + error.message);
			});
			child.stdin?.on("error", (error) => {
				debugLog("stdin failed event=" + hookEventName + " error=" + error.message);
			});
			child.stdin?.end(payload);
			child.unref();
			debugLog(
				"spawned event=" +
					hookEventName +
					" sessionId=" +
					(sessionId || "") +
					" terminalId=" +
					(env.SUPERSET_TERMINAL_ID || ""),
			);
		} catch (error) {
			// Best effort only. Superset notifications must never interrupt Amp.
			debugLog(
				"spawn threw event=" +
					hookEventName +
					" error=" +
					(error instanceof Error ? error.message : String(error)),
			);
		}
	};

	amp.on("session.start", async (event) => {
		notify("SessionStart", event);
	});
	amp.on("agent.start", async (event) => {
		notify("Start", event);
	});
	amp.on("agent.end", async (event) => {
		notify("Stop", event);
	});
}
