import { beforeEach, describe, expect, it } from "bun:test";
import type { UseNavigateResult } from "@tanstack/react-router";
import { useV2WorkspaceNavigationStore } from "renderer/stores/v2-workspace-navigation";
import {
	navigateToV2Workspace,
	resetV2WorkspaceNavigationStateForTesting,
} from "./workspace-navigation";

function createDeferred() {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, reject, resolve };
}

describe("navigateToV2Workspace", () => {
	beforeEach(() => {
		resetV2WorkspaceNavigationStateForTesting();
		useV2WorkspaceNavigationStore.setState({ pendingWorkspaceId: null });
	});

	it("starts the first plain workspace switch immediately", async () => {
		const calls: unknown[] = [];
		const firstNavigation = createDeferred();
		const navigate = ((options: unknown) => {
			calls.push(options);
			return firstNavigation.promise;
		}) as UseNavigateResult<string>;

		const promise = navigateToV2Workspace("workspace-a", navigate);

		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: "workspace-a" },
			search: {},
		});
		expect(useV2WorkspaceNavigationStore.getState().pendingWorkspaceId).toBe(
			"workspace-a",
		);

		firstNavigation.resolve();
		await promise;
		expect(
			useV2WorkspaceNavigationStore.getState().pendingWorkspaceId,
		).toBeNull();
	});

	it("coalesces plain switches while a route transition is in flight", async () => {
		const calls: unknown[] = [];
		const firstNavigation = createDeferred();
		const queuedNavigation = createDeferred();
		const navigate = ((options: unknown) => {
			calls.push(options);
			return calls.length === 1
				? firstNavigation.promise
				: queuedNavigation.promise;
		}) as UseNavigateResult<string>;

		const first = navigateToV2Workspace("workspace-a", navigate);
		const second = navigateToV2Workspace("workspace-b", navigate);
		const third = navigateToV2Workspace("workspace-c", navigate);

		expect(calls).toHaveLength(1);
		expect(useV2WorkspaceNavigationStore.getState().pendingWorkspaceId).toBe(
			"workspace-c",
		);

		firstNavigation.resolve();
		await first;
		await Promise.resolve();

		expect(calls).toHaveLength(2);
		expect(calls[1]).toMatchObject({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: "workspace-c" },
			search: {},
		});

		queuedNavigation.resolve();
		await Promise.all([second, third]);
		expect(
			useV2WorkspaceNavigationStore.getState().pendingWorkspaceId,
		).toBeNull();
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

	it("cancels a queued plain switch when a focused request arrives", async () => {
		const calls: unknown[] = [];
		const firstNavigation = createDeferred();
		const focusedNavigation = createDeferred();
		const navigate = ((options: unknown) => {
			calls.push(options);
			return calls.length === 1
				? firstNavigation.promise
				: focusedNavigation.promise;
		}) as UseNavigateResult<string>;

		const first = navigateToV2Workspace("workspace-a", navigate);
		const pendingPlainSwitch = navigateToV2Workspace("workspace-b", navigate);
		const focusedSwitch = navigateToV2Workspace("workspace-c", navigate, {
			search: { terminalId: "terminal-b" },
		});
		await pendingPlainSwitch;

		expect(calls).toHaveLength(2);
		expect(calls[1]).toMatchObject({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: "workspace-c" },
			search: { terminalId: "terminal-b" },
		});

		firstNavigation.resolve();
		focusedNavigation.resolve();
		await Promise.all([first, focusedSwitch]);
		expect(
			useV2WorkspaceNavigationStore.getState().pendingWorkspaceId,
		).toBeNull();
	});
});
