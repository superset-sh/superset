import { expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import type { SubmitOutcome } from "renderer/stores/workspace-creates";
import {
	type CachedLinkedWorkspace,
	mergeLinkedWorkspace,
	reconcileCachedLinkedWorkspace,
} from "./mergeLinkedWorkspace";
import {
	liveWorkspaceIdsForHost,
	resolveLinkedWorkspaceId,
} from "./resolveLinkedWorkspaceId";
import {
	type SendCommentToAgentDeps,
	type SendCommentToAgentInput,
	sendCommentToAgent,
} from "./sendCommentToAgent";

const input: SendCommentToAgentInput = {
	comment: "please fix this",
	target: { kind: "new", configId: "claude", placement: "split-pane" },
	path: "src/index.ts",
	startLine: 3,
	endLine: 5,
	side: "additions",
};

const LINKED_WORKSPACE_KEY = ["pull-request-linked-workspace", "project-1", 42];

/**
 * Wires the deps the way PullRequestCodeTab does — the query cache carries the
 * workspace a failed launch left behind, and the live-workspace mirror decides
 * whether that id is still usable. `mount()` rebuilds only what the component
 * rebuilds, so a test can leave the Code tab and come back.
 */
function harness(outcomes: SubmitOutcome[]) {
	const queryClient = new QueryClient();
	const live: { id: string; hostId: string }[] = [];
	// The host answers its workspace list until a test says it stopped.
	const answeredHostIds = new Set(["host-1"]);
	const submitWorkspaceCreate = mock(() => {
		const outcome = outcomes.shift();
		if (!outcome) throw new Error("unexpected create");
		if (outcome.workspaceId !== undefined) {
			live.push({ id: outcome.workspaceId, hostId: "host-1" });
		}
		return {
			workspaceId: "optimistic",
			completed: Promise.resolve(outcome),
		};
	});
	const runAgent = mock(
		async (_args: { workspaceId: string; agent: string; prompt: string }) =>
			undefined,
	);
	/** The host's `workspace:changed` broadcast landing a row in the mirror. */
	const list = (workspaceId: string) => {
		if (!live.some((workspace) => workspace.id === workspaceId)) {
			live.push({ id: workspaceId, hostId: "host-1" });
		}
	};
	const archive = (workspaceId: string) => {
		const index = live.findIndex((workspace) => workspace.id === workspaceId);
		if (index >= 0) live.splice(index, 1);
	};
	/** The linked-workspace query answering, exactly as the tab caches it. */
	const refetchLink = (answered: string | null) => {
		queryClient.setQueryData(
			LINKED_WORKSPACE_KEY,
			mergeLinkedWorkspace(
				queryClient.getQueryData<CachedLinkedWorkspace>(LINKED_WORKSPACE_KEY),
				{ workspaceId: answered },
			),
		);
	};
	const mount = (): SendCommentToAgentDeps => {
		// The tab's reconcile effect, on the values the render computes it
		// from: what the host's list proves about the cached id is written
		// down, so later silence has nothing to hand back.
		const write = reconcileCachedLinkedWorkspace({
			cached:
				queryClient.getQueryData<CachedLinkedWorkspace>(LINKED_WORKSPACE_KEY),
			liveWorkspaceIds: liveWorkspaceIdsForHost({
				hostId: "host-1",
				workspaces: live,
				answeredHostIds,
			}),
		});
		if (write) queryClient.setQueryData(LINKED_WORKSPACE_KEY, write);
		return {
			hostId: "host-1",
			projectId: "project-1",
			prNumber: 42,
			getLinkedWorkspaceId: () =>
				resolveLinkedWorkspaceId({
					workspaceId:
						queryClient.getQueryData<CachedLinkedWorkspace>(
							LINKED_WORKSPACE_KEY,
						)?.workspaceId,
					liveWorkspaceIds: liveWorkspaceIdsForHost({
						hostId: "host-1",
						workspaces: live,
						answeredHostIds,
					}),
				}),
			writeTerminalInput: mock(async () => undefined),
			runAgent,
			submitWorkspaceCreate,
			onWorkspaceCreated: (workspaceId) => {
				queryClient.setQueryData(LINKED_WORKSPACE_KEY, {
					workspaceId,
					seeded: true,
				});
			},
		};
	};
	return {
		mount,
		submitWorkspaceCreate,
		runAgent,
		list,
		archive,
		refetchLink,
		answeredHostIds,
	};
}

test("a retry after a failed agent launch reuses the workspace instead of creating a second one", async () => {
	const { mount, submitWorkspaceCreate, runAgent } = harness([
		{ ok: false, workspaceId: "ws-1", error: "Agent launch failed: boom" },
	]);
	const deps = mount();

	await expect(sendCommentToAgent(deps, input)).rejects.toThrow(
		"Agent launch failed: boom",
	);
	await sendCommentToAgent(deps, input);

	expect(submitWorkspaceCreate).toHaveBeenCalledTimes(1);
	expect(runAgent).toHaveBeenCalledTimes(1);
	expect(runAgent.mock.calls[0][0]).toMatchObject({
		workspaceId: "ws-1",
		agent: "claude",
	});
});

test("the workspace survives leaving the Code tab and coming back", async () => {
	const { mount, submitWorkspaceCreate, runAgent } = harness([
		{ ok: false, workspaceId: "ws-1", error: "Agent launch failed: boom" },
	]);

	await expect(sendCommentToAgent(mount(), input)).rejects.toThrow(
		"Agent launch failed: boom",
	);
	// Everything the component holds is gone; only the query cache is left.
	await sendCommentToAgent(mount(), input);

	expect(submitWorkspaceCreate).toHaveBeenCalledTimes(1);
	expect(runAgent).toHaveBeenCalledTimes(1);
	expect(runAgent.mock.calls[0][0]).toMatchObject({ workspaceId: "ws-1" });
});

test("a workspace archived after the failed launch is not sent into", async () => {
	const { mount, submitWorkspaceCreate, runAgent, archive } = harness([
		{ ok: false, workspaceId: "ws-1", error: "Agent launch failed: boom" },
		{ ok: true, workspaceId: "ws-2" },
	]);

	await expect(sendCommentToAgent(mount(), input)).rejects.toThrow(
		"Agent launch failed: boom",
	);
	// Deleting a workspace archives it; the live mirror drops the row while the
	// seeded id and the host's own row both survive.
	archive("ws-1");
	await sendCommentToAgent(mount(), input);

	expect(submitWorkspaceCreate).toHaveBeenCalledTimes(2);
	expect(runAgent).not.toHaveBeenCalled();
});

test("a link refetch that has not caught up does not check the PR out twice", async () => {
	const { mount, submitWorkspaceCreate, runAgent, refetchLink } = harness([
		{ ok: false, workspaceId: "ws-1", error: "Agent launch failed: boom" },
	]);

	await expect(sendCommentToAgent(mount(), input)).rejects.toThrow(
		"Agent launch failed: boom",
	);
	// Past the query's staleness window the tab refetches, and the host's PR
	// sync has not linked the workspace yet.
	refetchLink(null);
	await sendCommentToAgent(mount(), input);

	expect(submitWorkspaceCreate).toHaveBeenCalledTimes(1);
	expect(runAgent.mock.calls[0][0]).toMatchObject({ workspaceId: "ws-1" });
});

test("a host that stopped answering its workspace list does not lose the workspace", async () => {
	const { mount, submitWorkspaceCreate, runAgent, answeredHostIds } = harness([
		{ ok: false, workspaceId: "ws-1", error: "Agent launch failed: boom" },
	]);

	await expect(sendCommentToAgent(mount(), input)).rejects.toThrow(
		"Agent launch failed: boom",
	);
	// The list query errors out: no rows, and no statement about ws-1 either.
	answeredHostIds.delete("host-1");
	await sendCommentToAgent(mount(), input);

	expect(submitWorkspaceCreate).toHaveBeenCalledTimes(1);
	expect(runAgent.mock.calls[0][0]).toMatchObject({ workspaceId: "ws-1" });
});

test("a workspace the host proved gone stays gone once its list errors", async () => {
	const { mount, submitWorkspaceCreate, runAgent, archive, answeredHostIds } =
		harness([
			{ ok: false, workspaceId: "ws-1", error: "Agent launch failed: boom" },
			{ ok: true, workspaceId: "ws-2" },
		]);

	await expect(sendCommentToAgent(mount(), input)).rejects.toThrow(
		"Agent launch failed: boom",
	);
	// The tab renders on with the workspace the failed launch left behind:
	// the host lists it, which is what makes a later list without it proof.
	mount();
	// The user deletes ws-1. The host keeps answering `null` about the link
	// forever — it filters archived rows out — so only its workspace list can
	// prove the id gone, and here it does.
	archive("ws-1");
	mount();
	// Then one `workspace.list` refetch fails. The host says nothing at all,
	// which must not hand back the workspace its own answer already retired.
	answeredHostIds.delete("host-1");
	await sendCommentToAgent(mount(), input);

	expect(submitWorkspaceCreate).toHaveBeenCalledTimes(2);
	expect(runAgent).not.toHaveBeenCalled();
});

test("a workspace the host has not listed yet is not retired", async () => {
	const { mount, submitWorkspaceCreate, runAgent, archive, list } = harness([
		{ ok: false, workspaceId: "ws-1", error: "Agent launch failed: boom" },
	]);

	await expect(sendCommentToAgent(mount(), input)).rejects.toThrow(
		"Agent launch failed: boom",
	);
	// A create the host answers with a different canonical id than the
	// optimistic row leaves the tab holding an id the list has not caught up
	// to. Retiring it here would check the PR out a second time.
	archive("ws-1");
	mount();
	list("ws-1");
	await sendCommentToAgent(mount(), input);

	expect(submitWorkspaceCreate).toHaveBeenCalledTimes(1);
	expect(runAgent.mock.calls[0][0]).toMatchObject({ workspaceId: "ws-1" });
});

test("a create that produced no workspace leaves the next send on the create path", async () => {
	const { mount, submitWorkspaceCreate, runAgent } = harness([
		{ ok: false, error: "Host service is not running" },
		{ ok: true, workspaceId: "ws-2" },
	]);
	const deps = mount();

	await expect(sendCommentToAgent(deps, input)).rejects.toThrow(
		"Host service is not running",
	);
	await sendCommentToAgent(deps, input);

	expect(submitWorkspaceCreate).toHaveBeenCalledTimes(2);
	expect(runAgent).not.toHaveBeenCalled();
});
