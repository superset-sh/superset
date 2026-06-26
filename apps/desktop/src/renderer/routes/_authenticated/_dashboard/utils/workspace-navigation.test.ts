import { describe, expect, test } from "bun:test";
import type { UseNavigateResult } from "@tanstack/react-router";
import { navigateToV2Workspace } from "./workspace-navigation";

interface CapturedNavigateCall {
	to?: string;
	params?: Record<string, unknown>;
	search?: Record<string, unknown>;
	[key: string]: unknown;
}

function createCapturingNavigate() {
	const calls: CapturedNavigateCall[] = [];
	const navigate = ((options: CapturedNavigateCall) => {
		calls.push(options);
		return Promise.resolve();
	}) as unknown as UseNavigateResult<string>;
	return { navigate, calls };
}

describe("navigateToV2Workspace", () => {
	test("navigates to the V2 workspace path with empty search by default", async () => {
		const { navigate, calls } = createCapturingNavigate();

		await navigateToV2Workspace("workspace-b", navigate);

		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: "workspace-b" },
			search: {},
		});
	});

	test("clears search params so stale openUrl/terminalId/chatSessionId from the previous workspace don't leak in", async () => {
		const { navigate, calls } = createCapturingNavigate();

		await navigateToV2Workspace("workspace-c", navigate);

		expect(calls[0]?.search).toEqual({});
	});

	test("forwards an explicit search payload through to navigate", async () => {
		const { navigate, calls } = createCapturingNavigate();

		await navigateToV2Workspace("workspace-d", navigate, {
			search: { terminalId: "terminal-1" },
		});

		expect(calls[0]?.search).toEqual({ terminalId: "terminal-1" });
	});
});
