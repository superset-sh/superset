import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import type { ServerMessage } from "../../src/events";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createProjectScenario } from "../helpers/scenarios";

type SettledMessage = Extract<
	ServerMessage,
	{ type: "workspace:create-settled" }
>;

/** Capture workspace:create-settled broadcasts without a WebSocket client. */
function captureSettled(eventBus: {
	broadcastWorkspaceCreateSettled: (
		message: Omit<SettledMessage, "type">,
	) => void;
}): Array<Omit<SettledMessage, "type">> {
	const captured: Array<Omit<SettledMessage, "type">> = [];
	const original = eventBus.broadcastWorkspaceCreateSettled.bind(eventBus);
	eventBus.broadcastWorkspaceCreateSettled = (message) => {
		captured.push(message);
		original(message);
	};
	return captured;
}

async function waitFor(
	predicate: () => boolean,
	timeoutMs = 30_000,
): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > timeoutMs) {
			throw new Error("Timed out waiting for condition");
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

describe("workspaces.createEnqueued integration", () => {
	let dispose: (() => Promise<void>) | undefined;

	afterEach(async () => {
		if (dispose) {
			await dispose();
			dispose = undefined;
		}
	});

	test("returns immediately, then broadcasts a settled event with the create result", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;
		const settled = captureSettled(scenario.host.eventBus);

		const id = randomUUID();
		const enqueue = await scenario.host.trpc.workspaces.createEnqueued.mutate({
			projectId: scenario.projectId,
			name: "enqueued ws",
			branch: "feature/enqueued",
			id,
		});
		expect(enqueue.workspaceId).toBe(id);
		// The enqueue response must not wait for the create: the mutation
		// round-trip is milliseconds while the worktree add takes hundreds,
		// so nothing may have settled by the time the response resolves.
		expect(settled.length).toBe(0);
		await waitFor(() => settled.length > 0);

		const event = settled[0];
		expect(event?.workspaceId).toBe(id);
		expect(event?.ok).toBe(true);
		expect(event?.canonicalWorkspaceId).toBeTruthy();
		expect(event?.projectId).toBe(scenario.projectId);
		expect(event?.alreadyExists).toBe(false);

		const persisted = scenario.host.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, event?.canonicalWorkspaceId ?? ""))
			.get();
		expect(persisted?.branch).toBe("feature/enqueued");
		expect(existsSync(persisted?.worktreePath ?? "")).toBe(true);
	});

	test("resolving to an existing workspace settles with the canonical id and alreadyExists", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		const first = await scenario.host.trpc.workspaces.create.mutate({
			projectId: scenario.projectId,
			name: "original ws",
			branch: "feature/shared-branch",
		});
		const canonicalId = first.workspace.id;

		const settled = captureSettled(scenario.host.eventBus);
		const enqueueId = randomUUID();
		await scenario.host.trpc.workspaces.createEnqueued.mutate({
			projectId: scenario.projectId,
			branch: "feature/shared-branch",
			id: enqueueId,
		});
		await waitFor(() => settled.length > 0);

		const event = settled[0];
		// The renderer keys cleanup off this divergence: the optimistic row
		// under enqueueId is dropped in favor of the canonical workspace.
		expect(event?.workspaceId).toBe(enqueueId);
		expect(event?.ok).toBe(true);
		expect(event?.canonicalWorkspaceId).toBe(canonicalId);
		expect(event?.alreadyExists).toBe(true);
	});

	test("rejects without a client-minted id", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;

		await expect(
			scenario.host.trpc.workspaces.createEnqueued.mutate({
				projectId: scenario.projectId,
				branch: "feature/no-id",
			}),
		).rejects.toThrow(/requires a client-minted/);
	});

	test("rejects with NOT_FOUND before enqueueing when the project directory is missing from disk", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;
		const settled = captureSettled(scenario.host.eventBus);
		rmSync(scenario.repo.repoPath, { recursive: true, force: true });

		await expect(
			scenario.host.trpc.workspaces.createEnqueued.mutate({
				projectId: scenario.projectId,
				branch: "feature/gone-repo",
				id: randomUUID(),
			}),
		).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
		// Cheap validation rejected the call, so no background create ran and
		// nothing settles later.
		expect(settled.length).toBe(0);
	});

	test("a create that fails after enqueue broadcasts ok:false with the error", async () => {
		const scenario = await createProjectScenario({
			hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
		});
		dispose = scenario.dispose;
		const settled = captureSettled(scenario.host.eventBus);

		const id = randomUUID();
		// ".." is invalid in a git ref, so the worktree add fails mid-create.
		const enqueue = await scenario.host.trpc.workspaces.createEnqueued.mutate({
			projectId: scenario.projectId,
			branch: "feature/bad..ref",
			id,
		});
		expect(enqueue.workspaceId).toBe(id);

		await waitFor(() => settled.length > 0);
		const event = settled[0];
		expect(event?.workspaceId).toBe(id);
		expect(event?.ok).toBe(false);
		expect(event?.error).toBeTruthy();
		expect(event?.canonicalWorkspaceId).toBeNull();
	});
});
