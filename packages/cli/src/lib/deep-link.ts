import { spawn } from "node:child_process";

/**
 * The kind of agent session returned by `agents run`. A `chat` session is a
 * Superset agent pane; a `terminal` session is a CLI agent (claude, codex, …).
 */
export type SessionKind = "chat" | "terminal";

/** Deep link that opens a workspace in the Superset desktop app. */
export function workspaceDeepLink(workspaceId: string): string {
	return `superset://v2-workspace/${workspaceId}`;
}

/**
 * Deep link that opens a workspace AND focuses a specific agent session as a
 * pane. The desktop v2-workspace view only renders a pane when the route is
 * opened with the matching search param, so the param name must follow the
 * session `kind`: `chat` → `chatSessionId`, `terminal` → `terminalId`.
 */
export function sessionDeepLink(
	workspaceId: string,
	kind: SessionKind,
	sessionId: string,
): string {
	const param = kind === "chat" ? "chatSessionId" : "terminalId";
	return `${workspaceDeepLink(workspaceId)}?${param}=${encodeURIComponent(sessionId)}`;
}

/** Open a deep link URL in the desktop app via the platform handler. */
export function openUrl(url: string): Promise<void> {
	const [bin, args]: [string, string[]] =
		process.platform === "darwin"
			? ["open", [url]]
			: process.platform === "win32"
				? ["cmd", ["/c", "start", "", url]]
				: ["xdg-open", [url]];

	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, { stdio: "ignore", detached: true });
		child.once("error", reject);
		child.once("spawn", () => {
			child.unref();
			resolve();
		});
	});
}
