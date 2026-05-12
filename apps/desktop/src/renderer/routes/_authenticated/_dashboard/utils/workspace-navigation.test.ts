import { describe, expect, it } from "bun:test";
import type { UseNavigateResult } from "@tanstack/react-router";
import { navigateToV2Workspace } from "./workspace-navigation";

describe("navigateToV2Workspace", () => {
	it("coalesces rapid plain workspace switches to the latest target", async () => {
		const calls: unknown[] = [];
		const navigate = ((options: unknown) => {
			calls.push(options);
			return Promise.resolve();
		}) as UseNavigateResult<string>;

		const first = navigateToV2Workspace("workspace-a", navigate);
		const second = navigateToV2Workspace("workspace-b", navigate);

		await Promise.all([first, second]);

		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: "workspace-b" },
			search: {},
		});
	});

	it("does not delay focused workspace navigation requests", async () => {
		const calls: unknown[] = [];
		const navigate = ((options: unknown) => {
			calls.push(options);
			return Promise.resolve();
		}) as UseNavigateResult<string>;

		await navigateToV2Workspace("workspace-a", navigate, {
			search: { terminalId: "terminal-a" },
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: "workspace-a" },
			search: { terminalId: "terminal-a" },
		});
	});

	it("cancels a pending plain switch when a focused request arrives", async () => {
		const calls: unknown[] = [];
		const navigate = ((options: unknown) => {
			calls.push(options);
			return Promise.resolve();
		}) as UseNavigateResult<string>;

		const pendingPlainSwitch = navigateToV2Workspace("workspace-a", navigate);
		await navigateToV2Workspace("workspace-b", navigate, {
			search: { terminalId: "terminal-b" },
		});
		await pendingPlainSwitch;

		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: "workspace-b" },
			search: { terminalId: "terminal-b" },
		});
	});
});
