import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { projects, terminalSessions, workspaces } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("notifications.hook integration", () => {
	let host: TestHost;
	let repo: GitFixture;

	beforeEach(async () => {
		host = await createTestHost();
		repo = await createGitFixture();
	});

	afterEach(async () => {
		await host.dispose();
		repo.dispose();
	});

	test("ignores unknown event types without authentication", async () => {
		const result = await host.unauthenticatedTrpc.notifications.hook.mutate({
			eventType: "garbage",
			terminalId: "terminal-1",
		});
		expect(result).toEqual({ success: true, ignored: true });
	});

	test("ignores hook with missing terminalId", async () => {
		const result = await host.unauthenticatedTrpc.notifications.hook.mutate({
			eventType: "Stop",
		});
		expect(result).toEqual({ success: true, ignored: true });
	});

	test("ignores hook for unknown terminalId", async () => {
		const result = await host.unauthenticatedTrpc.notifications.hook.mutate({
			eventType: "Stop",
			terminalId: "no-such-terminal",
		});
		expect(result).toEqual({ success: true, ignored: true });
	});

	test("broadcasts when terminal session resolves to a workspace", async () => {
		const projectId = randomUUID();
		const workspaceId = randomUUID();
		const terminalId = randomUUID();

		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath: repo.repoPath,
				branch: "main",
			})
			.run();
		host.db
			.insert(terminalSessions)
			.values({ id: terminalId, originWorkspaceId: workspaceId })
			.run();

		const result = await host.unauthenticatedTrpc.notifications.hook.mutate({
			eventType: "Stop",
			terminalId,
		});
		expect(result).toEqual({ success: true, ignored: false });
	});
});
