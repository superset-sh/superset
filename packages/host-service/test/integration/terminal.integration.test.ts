import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { TRPCClientError } from "@trpc/client";
import { listTerminalResourceSessions } from "../../src/terminal/resource-sessions";
import { type BasicScenario, createBasicScenario } from "../helpers/scenarios";
import { seedTerminalSession } from "../helpers/seed";

describe("terminal router integration", () => {
	let scenario: BasicScenario;

	beforeEach(async () => {
		scenario = await createBasicScenario();
	});

	afterEach(async () => {
		await scenario?.dispose();
	});

	test("listSessions returns empty when no sessions exist", async () => {
		const result = await scenario.host.trpc.terminal.listSessions.query({
			workspaceId: scenario.workspaceId,
		});
		expect(result.sessions).toEqual([]);
	});

	test("killSession throws NOT_FOUND for unknown workspace", async () => {
		await expect(
			scenario.host.trpc.terminal.killSession.mutate({
				workspaceId: "no-such-ws",
				terminalId: randomUUID(),
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("killSession throws NOT_FOUND for unknown terminal", async () => {
		await expect(
			scenario.host.trpc.terminal.killSession.mutate({
				workspaceId: scenario.workspaceId,
				terminalId: randomUUID(),
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("listSessions requires authentication", async () => {
		await expect(
			scenario.host.unauthenticatedTrpc.terminal.listSessions.query({
				workspaceId: scenario.workspaceId,
			}),
		).rejects.toBeInstanceOf(TRPCClientError);
	});

	test("resource sessions are daemon-sourced and joined to active DB rows", () => {
		const activeTerminalId = randomUUID();
		const disposedTerminalId = randomUUID();
		const exitedTerminalId = randomUUID();
		const orphanTerminalId = randomUUID();
		const fractionalPidTerminalId = randomUUID();
		const unknownTerminalId = randomUUID();
		seedTerminalSession(scenario.host, {
			id: activeTerminalId,
			originWorkspaceId: scenario.workspaceId,
		});
		seedTerminalSession(scenario.host, {
			id: disposedTerminalId,
			originWorkspaceId: scenario.workspaceId,
			status: "disposed",
		});
		seedTerminalSession(scenario.host, {
			id: exitedTerminalId,
			originWorkspaceId: scenario.workspaceId,
			status: "exited",
		});
		seedTerminalSession(scenario.host, {
			id: orphanTerminalId,
			originWorkspaceId: null,
		});
		seedTerminalSession(scenario.host, {
			id: fractionalPidTerminalId,
			originWorkspaceId: scenario.workspaceId,
		});

		const sessions = listTerminalResourceSessions(
			scenario.host.db,
			[
				{
					id: activeTerminalId,
					pid: 123,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: disposedTerminalId,
					pid: 124,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: exitedTerminalId,
					pid: 125,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: orphanTerminalId,
					pid: 126,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: unknownTerminalId,
					pid: 127,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: fractionalPidTerminalId,
					pid: 128.5,
					cols: 80,
					rows: 24,
					alive: true,
				},
				{
					id: activeTerminalId,
					pid: 129,
					cols: 80,
					rows: 24,
					alive: false,
				},
			],
			new Map([[activeTerminalId, "Claude Code"]]),
		);

		expect(sessions).toEqual([
			{
				terminalId: activeTerminalId,
				workspaceId: scenario.workspaceId,
				pid: 123,
				title: "Claude Code",
			},
		]);
	});
});
