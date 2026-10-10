import { describe, expect, test } from "bun:test";
import { CLIError } from "@superset/cli-framework";
import { MAX_REMOTE_TERMINAL_AGENT_WAIT_TIMEOUT_MS } from "@superset/shared/terminal-agent-wait";
import { TRPCClientError } from "@trpc/client";
import {
	assertWaitTimeoutFitsTarget,
	describeAgentStatus,
	parseUntil,
	waitErrorToCliError,
} from "./terminal-agent-wait";

describe("parseUntil", () => {
	test("splits, trims, lowercases and dedupes", () => {
		expect(parseUntil(" Idle, permission ,idle,ENDED")).toEqual([
			"idle",
			"permission",
			"ended",
		]);
	});

	test("names every unknown status", () => {
		expect(() => parseUntil("idle,done,stopped")).toThrow(
			'--until: unknown status "done", "stopped"',
		);
	});

	test("rejects an empty list", () => {
		expect(() => parseUntil(" , ")).toThrow(CLIError);
	});
});

describe("assertWaitTimeoutFitsTarget", () => {
	test("lets a local host wait as long as the host allows", () => {
		expect(() => assertWaitTimeoutFitsTarget("local", 600_000)).not.toThrow();
	});

	test("caps a remote or cloud wait under the relay cut", () => {
		expect(() =>
			assertWaitTimeoutFitsTarget(
				"remote",
				MAX_REMOTE_TERMINAL_AGENT_WAIT_TIMEOUT_MS,
			),
		).not.toThrow();
		expect(() =>
			assertWaitTimeoutFitsTarget(
				"remote",
				MAX_REMOTE_TERMINAL_AGENT_WAIT_TIMEOUT_MS + 1,
			),
		).toThrow(CLIError);
		expect(() => assertWaitTimeoutFitsTarget("cloud", 120_000)).toThrow(
			CLIError,
		);
	});
});

describe("describeAgentStatus", () => {
	const binding = {
		terminalId: "t1",
		workspaceId: "ws-1",
		agentId: "claude" as const,
		agentSessionId: null,
		definitionId: null,
		startedAt: 1,
		lastEventAt: 2,
		lastEventType: "Stop",
		endedAt: null,
		endReason: null,
	};

	test("names the hook event behind a live status", () => {
		expect(
			describeAgentStatus({
				binding,
				status: "idle",
				observedAt: 2,
				sinceMs: 1_234,
			}),
		).toBe("idle (Stop 1.2s ago)");
	});

	test("names the end reason once the session ended", () => {
		expect(
			describeAgentStatus({
				binding: { ...binding, endedAt: 3, endReason: "terminal-exited" },
				status: "ended",
				observedAt: 3,
				sinceMs: 500,
			}),
		).toBe("ended (terminal-exited 0.5s ago)");
	});
});

describe("waitErrorToCliError", () => {
	const context = {
		terminalId: "t1",
		until: ["idle"] as const,
		timeoutMs: 45_000,
	};
	const trpcError = (code: string, message = "boom") =>
		new TRPCClientError(message, {
			result: { error: { code: -1, message, data: { code } } },
		} as never);

	test("passes the host's TIMEOUT message through, with a hint for a working agent", () => {
		const error = waitErrorToCliError(
			trpcError(
				"TIMEOUT",
				"Timed out after 45000ms waiting for terminal t1 to reach one of: idle (last status: working)",
			),
			context,
		);
		expect(error).toBeInstanceOf(CLIError);
		expect(error?.message).toBe(
			"Timed out after 45000ms waiting for terminal t1 to reach one of: idle (last status: working)",
		);
		expect(error?.suggestion).toContain("may still be working");
	});

	test("points a shell with no agent at wait-output", () => {
		const error = waitErrorToCliError(
			trpcError(
				"TIMEOUT",
				"Timed out after 3000ms waiting for terminal t1 to reach one of: idle (no agent has reported from it)",
			),
			context,
		);
		expect(error?.suggestion).toContain("terminals wait-output");
	});

	test("passes the host's NOT_FOUND through, workspace id included", () => {
		expect(
			waitErrorToCliError(
				trpcError("NOT_FOUND", "No terminal t1 in workspace ws-1"),
				context,
			)?.message,
		).toBe("No terminal t1 in workspace ws-1");
	});

	test("tells an older host apart from a missing terminal", () => {
		const error = waitErrorToCliError(
			trpcError(
				"NOT_FOUND",
				'No "mutation"-procedure on path "terminalAgents.wait"',
			),
			context,
		);
		expect(error?.message).toBe("This host is too old to wait on an agent");
		expect(error?.suggestion).toContain("Update the host");
	});

	test("the timeout hint keeps the watermark", () => {
		const error = waitErrorToCliError(
			trpcError(
				"TIMEOUT",
				"Timed out after 45000ms waiting for terminal t1 to reach one of: idle (last status: working)",
			),
			context,
		);
		expect(error?.suggestion).toContain("same --after");
	});

	test("leaves other errors alone", () => {
		expect(waitErrorToCliError(new Error("network"), context)).toBeUndefined();
		expect(
			waitErrorToCliError(trpcError("FORBIDDEN"), context),
		).toBeUndefined();
	});
});
