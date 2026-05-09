import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { execSync } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import * as realOs from "node:os";
import path from "node:path";

const TEST_ROOT = path.join(
	realOs.tmpdir(),
	`superset-copilot-hook-${process.pid}-${Date.now()}`,
);
const TEST_HOOKS_DIR = path.join(TEST_ROOT, "superset", "hooks");

mock.module("shared/env.shared", () => ({
	env: {
		DESKTOP_NOTIFICATIONS_PORT: 7777,
	},
}));

mock.module("./paths", () => ({
	BIN_DIR: path.join(TEST_ROOT, "superset", "bin"),
	HOOKS_DIR: TEST_HOOKS_DIR,
	ZSH_DIR: path.join(TEST_ROOT, "superset", "zsh"),
	BASH_DIR: path.join(TEST_ROOT, "superset", "bash"),
}));

const { getCopilotHookScriptContent, getCopilotHooksJsonContent } =
	await import("./agent-wrappers-copilot");

describe("copilot hooks JSON (getCopilotHooksJsonContent)", () => {
	it("registers preToolUse hook for permission request detection", () => {
		const content = getCopilotHooksJsonContent("/path/to/hook.sh");
		const json = JSON.parse(content);
		expect(json.hooks.preToolUse).toBeDefined();
		expect(json.hooks.preToolUse[0].bash).toContain("preToolUse");
	});

	it("includes all required hook event types", () => {
		const content = getCopilotHooksJsonContent("/path/to/hook.sh");
		const json = JSON.parse(content);
		const hookTypes = Object.keys(json.hooks);
		expect(hookTypes).toContain("sessionStart");
		expect(hookTypes).toContain("sessionEnd");
		expect(hookTypes).toContain("userPromptSubmitted");
		expect(hookTypes).toContain("postToolUse");
		expect(hookTypes).toContain("preToolUse");
	});

	it("passes hook script path into each bash command", () => {
		const hookPath = "/custom/path/to/copilot-hook.sh";
		const content = getCopilotHooksJsonContent(hookPath);
		const json = JSON.parse(content);
		for (const [, hooks] of Object.entries(json.hooks)) {
			for (const hook of hooks as Array<{ bash: string }>) {
				expect(hook.bash).toContain(hookPath);
			}
		}
	});
});

describe("copilot hook script", () => {
	let scriptPath: string;

	beforeEach(() => {
		mkdirSync(TEST_HOOKS_DIR, { recursive: true });
		scriptPath = path.join(TEST_HOOKS_DIR, "copilot-hook.sh");
		const content = getCopilotHookScriptContent();
		writeFileSync(scriptPath, content, { mode: 0o755 });
		chmodSync(scriptPath, 0o755);
	});

	afterEach(() => {
		rmSync(TEST_ROOT, { recursive: true, force: true });
	});

	it("outputs valid JSON to stdout before stdin is closed (v1.0.22+ compat)", () => {
		// Simulate Copilot CLI v1.0.22+ behavior: pipe JSON to stdin but don't
		// close it immediately. The hook must output {} before waiting for stdin
		// to close. We use timeout to detect deadlocks.
		const result = execSync(
			`echo '{"context":"test"}' | timeout 3 "${scriptPath}" sessionStart`,
			{
				encoding: "utf-8",
				env: {
					PATH: process.env.PATH,
					SUPERSET_TAB_ID: "",
				},
			},
		);
		expect(result.trim()).toBe("{}");
	});

	it("outputs valid JSON for unknown event types", () => {
		const result = execSync(
			`echo '{}' | timeout 3 "${scriptPath}" unknownEvent`,
			{
				encoding: "utf-8",
				env: {
					PATH: process.env.PATH,
					SUPERSET_TAB_ID: "",
				},
			},
		);
		expect(result.trim()).toBe("{}");
	});

	it("exits cleanly without SUPERSET_TAB_ID set", () => {
		const result = execSync(
			`echo '{}' | timeout 3 "${scriptPath}" sessionStart`,
			{
				encoding: "utf-8",
				env: {
					PATH: process.env.PATH,
					SUPERSET_TAB_ID: "",
				},
			},
		);
		expect(result.trim()).toBe("{}");
	});

	it("sends Stop then Start for userPromptSubmitted (v1.0.22+ turn boundary)", async () => {
		// Start a mock HTTP server to capture notification requests
		const receivedEvents: string[] = [];
		const server = http.createServer((req, res) => {
			const url = new URL(req.url!, `http://127.0.0.1`);
			const eventType = url.searchParams.get("eventType");
			if (eventType) {
				receivedEvents.push(eventType);
			}
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end('{"success":true}');
		});

		const port = await new Promise<number>((resolve) => {
			server.listen(0, "127.0.0.1", () => {
				const addr = server.address();
				resolve(typeof addr === "object" ? addr?.port : 0);
			});
		});

		try {
			execSync(`echo '{}' | timeout 5 "${scriptPath}" userPromptSubmitted`, {
				encoding: "utf-8",
				env: {
					PATH: process.env.PATH,
					SUPERSET_TAB_ID: "tab-123",
					SUPERSET_PANE_ID: "pane-456",
					SUPERSET_WORKSPACE_ID: "ws-789",
					SUPERSET_PORT: String(port),
					SUPERSET_ENV: "development",
					SUPERSET_HOOK_VERSION: "2",
				},
			});

			// Give the background curl requests a moment to complete
			await new Promise((resolve) => setTimeout(resolve, 500));

			// userPromptSubmitted should emit Stop (previous turn done) then Start (new turn)
			expect(receivedEvents).toEqual(["Stop", "Start"]);
		} finally {
			server.close();
		}
	});

	it("sends Start for sessionStart", async () => {
		const receivedEvents: string[] = [];
		const server = http.createServer((req, res) => {
			const url = new URL(req.url!, `http://127.0.0.1`);
			const eventType = url.searchParams.get("eventType");
			if (eventType) receivedEvents.push(eventType);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end('{"success":true}');
		});

		const port = await new Promise<number>((resolve) => {
			server.listen(0, "127.0.0.1", () => {
				const addr = server.address();
				resolve(typeof addr === "object" ? addr?.port : 0);
			});
		});

		try {
			execSync(`echo '{}' | timeout 5 "${scriptPath}" sessionStart`, {
				encoding: "utf-8",
				env: {
					PATH: process.env.PATH,
					SUPERSET_TAB_ID: "tab-123",
					SUPERSET_PANE_ID: "pane-456",
					SUPERSET_WORKSPACE_ID: "ws-789",
					SUPERSET_PORT: String(port),
					SUPERSET_ENV: "development",
					SUPERSET_HOOK_VERSION: "2",
				},
			});

			await new Promise((resolve) => setTimeout(resolve, 500));
			expect(receivedEvents).toEqual(["Start"]);
		} finally {
			server.close();
		}
	});

	it("sends Stop for sessionEnd", async () => {
		const receivedEvents: string[] = [];
		const server = http.createServer((req, res) => {
			const url = new URL(req.url!, `http://127.0.0.1`);
			const eventType = url.searchParams.get("eventType");
			if (eventType) receivedEvents.push(eventType);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end('{"success":true}');
		});

		const port = await new Promise<number>((resolve) => {
			server.listen(0, "127.0.0.1", () => {
				const addr = server.address();
				resolve(typeof addr === "object" ? addr?.port : 0);
			});
		});

		try {
			execSync(`echo '{}' | timeout 5 "${scriptPath}" sessionEnd`, {
				encoding: "utf-8",
				env: {
					PATH: process.env.PATH,
					SUPERSET_TAB_ID: "tab-123",
					SUPERSET_PANE_ID: "pane-456",
					SUPERSET_WORKSPACE_ID: "ws-789",
					SUPERSET_PORT: String(port),
					SUPERSET_ENV: "development",
					SUPERSET_HOOK_VERSION: "2",
				},
			});

			await new Promise((resolve) => setTimeout(resolve, 500));
			expect(receivedEvents).toEqual(["Stop"]);
		} finally {
			server.close();
		}
	});

	it("sends PermissionRequest for preToolUse", async () => {
		const receivedEvents: string[] = [];
		const server = http.createServer((req, res) => {
			const url = new URL(req.url!, `http://127.0.0.1`);
			const eventType = url.searchParams.get("eventType");
			if (eventType) receivedEvents.push(eventType);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end('{"success":true}');
		});

		const port = await new Promise<number>((resolve) => {
			server.listen(0, "127.0.0.1", () => {
				const addr = server.address();
				resolve(typeof addr === "object" ? addr?.port : 0);
			});
		});

		try {
			execSync(`echo '{}' | timeout 5 "${scriptPath}" preToolUse`, {
				encoding: "utf-8",
				env: {
					PATH: process.env.PATH,
					SUPERSET_TAB_ID: "tab-123",
					SUPERSET_PANE_ID: "pane-456",
					SUPERSET_WORKSPACE_ID: "ws-789",
					SUPERSET_PORT: String(port),
					SUPERSET_ENV: "development",
					SUPERSET_HOOK_VERSION: "2",
				},
			});

			await new Promise((resolve) => setTimeout(resolve, 500));
			expect(receivedEvents).toEqual(["PermissionRequest"]);
		} finally {
			server.close();
		}
	});
});
