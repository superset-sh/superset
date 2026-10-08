import { afterEach, describe, expect, test } from "bun:test";
import type { TRPCLink } from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";
import type { ReactNode } from "react";
import type { GitChangesStatus } from "shared/changes-types";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { QueryClient } = await import("@tanstack/react-query");
const { observable } = await import("@trpc/server/observable");
const { act, cleanup, renderHook, waitFor } = await import(
	"@testing-library/react"
);
const { createElement } = await import("react");
const { electronTrpc } = await import("renderer/lib/electron-trpc");
const {
	ERROR_BACKOFF_REFETCH_INTERVAL_MS,
	GIT_CHANGES_QUERY_GC_TIME_MS,
	resolveStatusRefetchInterval,
	useGitChangesStatus,
} = await import("./useGitChangesStatus");

afterEach(cleanup);
const status: GitChangesStatus = {
	branch: "feature",
	defaultBranch: "release",
	againstBase: [],
	commits: [],
	totalCommitCount: 0,
	staged: [],
	unstaged: [],
	untracked: [],
	ahead: 0,
	behind: 0,
	pushCount: 0,
	pullCount: 0,
	hasUpstream: true,
};

interface Call {
	path: string;
	input: unknown;
}

function renderStatus(answerStatus: (attempt: number) => unknown) {
	const calls: Call[] = [];
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			calls.push({ path: call.op.path, input: call.op.input });
			if (call.op.path !== "changes.getStatus") return;
			const attempt = calls.filter(
				(made) => made.path === "changes.getStatus",
			).length;
			const answer = answerStatus(attempt);
			if (answer === undefined) return;
			observer.next({ result: { data: answer } });
			observer.complete();
		});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const client = electronTrpc.createClient({ links: [link] });
	const view = renderHook(
		() => useGitChangesStatus({ worktreePath: "/worktrees/one" }),
		{
			wrapper: ({ children }: { children: ReactNode }) =>
				createElement(electronTrpc.Provider, { client, queryClient, children }),
		},
	);
	return { calls, queryClient, view };
}

describe("useGitChangesStatus", () => {
	test("starts branch and status queries together on a cold workspace", async () => {
		const { calls, queryClient, view } = renderStatus(() => undefined);

		await waitFor(() => expect(calls).toHaveLength(2));
		expect(calls).toContainEqual({
			path: "changes.getBranches",
			input: { worktreePath: "/worktrees/one" },
		});
		expect(calls).toContainEqual({
			path: "changes.getStatus",
			input: { worktreePath: "/worktrees/one" },
		});
		expect(view.result.current.isLoading).toBe(true);
		for (const query of queryClient.getQueryCache().getAll()) {
			expect(query.options.gcTime).toBe(GIT_CHANGES_QUERY_GC_TIME_MS);
		}
	});

	test("keeps exact-worktree cached status visible during a refresh", async () => {
		const { calls, view } = renderStatus((attempt) =>
			attempt === 1 ? status : undefined,
		);
		await waitFor(() => expect(view.result.current.status).toEqual(status));

		act(() => {
			void view.result.current.refetch();
		});
		await waitFor(() =>
			expect(
				calls.filter((made) => made.path === "changes.getStatus"),
			).toHaveLength(2),
		);

		expect(view.result.current.status).toEqual(status);
		expect(view.result.current.isLoading).toBe(false);
		expect(view.result.current.effectiveBaseBranch).toBe("release");
	});
});

describe("resolveStatusRefetchInterval", () => {
	test("polls at the configured interval on success", () => {
		expect(
			resolveStatusRefetchInterval(2500, { status: "success", data: status }),
		).toBe(2500);
	});

	test("backs off to the slow interval on deterministic failures", () => {
		for (const code of [
			"BAD_REQUEST",
			"NOT_FOUND",
			"PRECONDITION_FAILED",
			"FORBIDDEN",
		]) {
			expect(
				resolveStatusRefetchInterval(2500, {
					status: "error",
					error: { data: { code } },
				}),
			).toBe(ERROR_BACKOFF_REFETCH_INTERVAL_MS);
		}
	});

	test("slows but keeps retrying on transient failures", () => {
		expect(
			resolveStatusRefetchInterval(2500, {
				status: "error",
				error: { data: { code: "INTERNAL_SERVER_ERROR" } },
			}),
		).toBe(10_000);
		expect(
			resolveStatusRefetchInterval(2500, { status: "error", error: null }),
		).toBe(10_000);
	});

	test("never starts polling on error when no interval is configured", () => {
		expect(
			resolveStatusRefetchInterval(undefined, {
				status: "error",
				error: { data: { code: "NOT_FOUND" } },
			}),
		).toBe(false);
	});
});
