import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { mapEventType } from "../notifications/map-event-type";

interface CapturedHookRequest {
	env: string | null;
	eventType: string | null;
	hookSessionId: string | null;
	paneId: string | null;
	resourceId: string | null;
	sessionId: string | null;
	tabId: string | null;
	version: string | null;
	workspaceId: string | null;
}

function renderNotifyScriptContent(): string {
	const templatePath = path.join(
		import.meta.dir,
		"templates",
		"notify-hook.template.sh",
	);
	return readFileSync(templatePath, "utf-8")
		.replaceAll("{{MARKER}}", "# Superset agent notification hook")
		.replaceAll("{{DEFAULT_PORT}}", "3486");
}

async function withCapturedHookRequest(
	run: (context: { port: number; tempDir: string; scriptPath: string }) => void,
): Promise<CapturedHookRequest> {
	const tempDir = mkdtempSync(path.join(tmpdir(), "superset-notify-hook-"));
	const scriptPath = path.join(tempDir, "notify.sh");
	writeFileSync(scriptPath, renderNotifyScriptContent(), { mode: 0o755 });

	let resolveRequest: ((request: CapturedHookRequest) => void) | null = null;
	let rejectRequest: ((error: Error) => void) | null = null;
	const requestPromise = new Promise<CapturedHookRequest>((resolve, reject) => {
		resolveRequest = resolve;
		rejectRequest = reject;
	});

	const server = createServer((req, res) => {
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end('{"success":true}');
		resolveRequest?.({
			env: url.searchParams.get("env"),
			eventType: url.searchParams.get("eventType"),
			hookSessionId: url.searchParams.get("hookSessionId"),
			paneId: url.searchParams.get("paneId"),
			resourceId: url.searchParams.get("resourceId"),
			sessionId: url.searchParams.get("sessionId"),
			tabId: url.searchParams.get("tabId"),
			version: url.searchParams.get("version"),
			workspaceId: url.searchParams.get("workspaceId"),
		});
	});

	try {
		await new Promise<void>((resolve) => {
			server.listen(0, "127.0.0.1", () => resolve());
		});

		const address = server.address();
		if (!address || typeof address === "string") {
			throw new Error(
				"Expected notify hook capture server to bind to a TCP port",
			);
		}

		run({ port: address.port, tempDir, scriptPath });

		return await Promise.race([
			requestPromise,
			new Promise<CapturedHookRequest>((_resolve, reject) => {
				setTimeout(() => {
					reject(new Error("Timed out waiting for notify hook HTTP request"));
				}, 2_000);
			}),
		]);
	} catch (error) {
		rejectRequest?.(
			error instanceof Error ? error : new Error("Notify hook test failed"),
		);
		throw error;
	} finally {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
		rmSync(tempDir, { force: true, recursive: true });
	}
}

describe("getNotifyScriptContent", () => {
	it("prefers Mastra resourceId over internal session_id", () => {
		const script = renderNotifyScriptContent();

		expect(script).toContain('RESOURCE_ID=$(echo "$INPUT"');
		expect(script).toContain(
			"SESSION_ID=" + "\u0024{RESOURCE_ID:-$HOOK_SESSION_ID}",
		);
		expect(script).toContain('--data-urlencode "resourceId=$RESOURCE_ID"');
		expect(script).toContain(
			'--data-urlencode "hookSessionId=$HOOK_SESSION_ID"',
		);
		expect(script).toContain(
			"event=$EVENT_TYPE sessionId=$SESSION_ID hookSessionId=$HOOK_SESSION_ID resourceId=$RESOURCE_ID",
		);
	});
});

describe("notify hook integration", () => {
	it("dispatches Codex UserPromptSubmit hook input with Superset terminal ids", async () => {
		const request = await withCapturedHookRequest(({ port, scriptPath }) => {
			execFileSync("bash", [scriptPath], {
				env: {
					...process.env,
					SUPERSET_DEBUG_HOOKS: "1",
					SUPERSET_ENV: "production",
					SUPERSET_HOOK_VERSION: "2",
					SUPERSET_PANE_ID: "pane-1",
					SUPERSET_PORT: String(port),
					SUPERSET_TAB_ID: "tab-1",
					SUPERSET_WORKSPACE_ID: "ws-1",
				},
				input: JSON.stringify({
					hook_event_name: "UserPromptSubmit",
					session_id: "session-1",
				}),
				stdio: ["pipe", "pipe", "pipe"],
			});
		});

		expect(request).toEqual({
			env: "production",
			eventType: "Start",
			hookSessionId: "session-1",
			paneId: "pane-1",
			resourceId: "",
			sessionId: "session-1",
			tabId: "tab-1",
			version: "2",
			workspaceId: "ws-1",
		});
		expect(mapEventType(request.eventType ?? undefined)).toBe("Start");
	});

	it("preserves lowercase Codex userPromptSubmit event names for server-side normalization", async () => {
		const request = await withCapturedHookRequest(({ port, scriptPath }) => {
			execFileSync("bash", [scriptPath], {
				env: {
					...process.env,
					SUPERSET_DEBUG_HOOKS: "1",
					SUPERSET_ENV: "production",
					SUPERSET_HOOK_VERSION: "2",
					SUPERSET_PANE_ID: "pane-1",
					SUPERSET_PORT: String(port),
					SUPERSET_TAB_ID: "tab-1",
					SUPERSET_WORKSPACE_ID: "ws-1",
				},
				input: JSON.stringify({
					hook_event_name: "userPromptSubmit",
					session_id: "session-1",
				}),
				stdio: ["pipe", "pipe", "pipe"],
			});
		});

		expect(request.eventType).toBe("userPromptSubmit");
		expect(mapEventType(request.eventType ?? undefined)).toBe("Start");
	});

	it("preserves lowercase Codex stop event names for server-side normalization", async () => {
		const request = await withCapturedHookRequest(({ port, scriptPath }) => {
			execFileSync("bash", [scriptPath], {
				env: {
					...process.env,
					SUPERSET_DEBUG_HOOKS: "1",
					SUPERSET_ENV: "production",
					SUPERSET_HOOK_VERSION: "2",
					SUPERSET_PANE_ID: "pane-1",
					SUPERSET_PORT: String(port),
					SUPERSET_TAB_ID: "tab-1",
					SUPERSET_WORKSPACE_ID: "ws-1",
				},
				input: JSON.stringify({
					hook_event_name: "stop",
					session_id: "session-1",
				}),
				stdio: ["pipe", "pipe", "pipe"],
			});
		});

		expect(request.eventType).toBe("stop");
		expect(mapEventType(request.eventType ?? undefined)).toBe("Stop");
	});
});
