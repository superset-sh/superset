import { beforeEach, describe, expect, it } from "bun:test";
import { ZmxSessionManager } from "./zmx-manager";
import type { SshConnectionManager } from "./connection-manager";

function createMockConnectionManager(): SshConnectionManager & {
	execCalls: string[];
	mockExecResult: { stdout: string; stderr: string; exitCode: number };
} {
	const mock = {
		execCalls: [] as string[],
		mockExecResult: { stdout: "", stderr: "", exitCode: 0 },

		async exec(command: string) {
			mock.execCalls.push(command);
			return mock.mockExecResult;
		},
	} as unknown as SshConnectionManager & {
		execCalls: string[];
		mockExecResult: { stdout: string; stderr: string; exitCode: number };
	};

	return mock;
}

describe("ZmxSessionManager", () => {
	let connMgr: ReturnType<typeof createMockConnectionManager>;
	let zmx: ZmxSessionManager;

	beforeEach(() => {
		connMgr = createMockConnectionManager();
		zmx = new ZmxSessionManager(connMgr);
	});

	describe("sanitizeSessionName", () => {
		it("prefixes with superset-", () => {
			expect(zmx.sanitizeSessionName("abc-123-def")).toBe(
				"superset-abc-123-def",
			);
		});

		it("strips dots from pane id", () => {
			expect(zmx.sanitizeSessionName("pane.with.dots")).toBe(
				"superset-panewithdots",
			);
		});

		it("strips special characters", () => {
			expect(zmx.sanitizeSessionName("a!@#b")).toBe("superset-ab");
		});

		it("preserves hyphens and underscores", () => {
			expect(zmx.sanitizeSessionName("my_pane-1")).toBe("superset-my_pane-1");
		});

		it("handles empty string", () => {
			expect(zmx.sanitizeSessionName("")).toBe("superset-");
		});
	});

	describe("killSession", () => {
		it("calls zmx kill with sanitized name", async () => {
			await zmx.killSession("pane-1");

			expect(connMgr.execCalls.length).toBe(1);
			expect(connMgr.execCalls[0]).toContain("~/.local/bin/zmx kill");
			expect(connMgr.execCalls[0]).toContain("superset-pane-1");
		});
	});

	describe("hasSession", () => {
		it("returns true when exitCode is 0", async () => {
			connMgr.mockExecResult = { stdout: "", stderr: "", exitCode: 0 };
			const result = await zmx.hasSession("pane-1");
			expect(result).toBe(true);
		});

		it("returns false when exitCode is 1", async () => {
			connMgr.mockExecResult = { stdout: "", stderr: "", exitCode: 1 };
			const result = await zmx.hasSession("pane-1");
			expect(result).toBe(false);
		});

		it("calls zmx list with grep for sanitized name", async () => {
			connMgr.mockExecResult = { stdout: "", stderr: "", exitCode: 0 };
			await zmx.hasSession("pane.2");

			expect(connMgr.execCalls[0]).toContain("~/.local/bin/zmx list --short");
			expect(connMgr.execCalls[0]).toContain("grep -q");
			expect(connMgr.execCalls[0]).toContain("superset-pane2");
		});
	});

	describe("listSessions", () => {
		it("returns only sessions with superset- prefix", async () => {
			connMgr.mockExecResult = {
				stdout: "superset-pane-1\nother-session\nsuperset-pane-2\n",
				stderr: "",
				exitCode: 0,
			};

			const sessions = await zmx.listSessions();
			expect(sessions).toEqual(["superset-pane-1", "superset-pane-2"]);
		});

		it("returns empty array when no matching sessions", async () => {
			connMgr.mockExecResult = {
				stdout: "other-session\n",
				stderr: "",
				exitCode: 0,
			};

			const sessions = await zmx.listSessions();
			expect(sessions).toEqual([]);
		});
	});
});
