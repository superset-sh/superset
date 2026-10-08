import { afterAll, afterEach, describe, expect, test } from "bun:test";
import type { AppRouter } from "@superset/trpc";
import { QueryClient } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { ReactNode } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { usePullRequestEvidence } from "./usePullRequestEvidence";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);
afterAll(() => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

describe("workspace evidence queries", () => {
	test("fetches only three workspace pages and never queries for an unrelated PR", async () => {
		const asked: { path: string; input: unknown }[] = [];
		const link: TRPCLink<AppRouter> =
			() =>
			({ op }) =>
				observable((observer) => {
					asked.push({ path: op.path, input: op.input });
					observer.next({
						result: {
							data:
								op.path === "page.counts"
									? { all: 5 }
									: { items: [], nextCursor: "next" },
						},
					});
					observer.complete();
				});
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const client = cloudTrpc.createClient({ links: [link] });
		const wrapper = ({ children }: { children: ReactNode }) => (
			<cloudTrpc.Provider client={client} queryClient={queryClient}>
				{children}
			</cloudTrpc.Provider>
		);
		const hook = renderHook(
			({ workspaceId, enabled }) =>
				usePullRequestEvidence(workspaceId, enabled),
			{ wrapper, initialProps: { workspaceId: "workspace-a", enabled: false } },
		);
		expect(asked).toEqual([]);
		hook.rerender({ workspaceId: "workspace-a", enabled: true });
		await waitFor(() => expect(hook.result.current.totalCount).toBe(5));
		expect(asked).toEqual([
			{
				path: "page.listPaginated",
				input: { workspaceId: "workspace-a", limit: 3 },
			},
			{ path: "page.counts", input: { workspaceId: "workspace-a" } },
		]);
		expect(hook.result.current.hasMore).toBe(true);
		hook.rerender({ workspaceId: "workspace-b", enabled: false });
		expect(hook.result.current.pages).toEqual([]);
		expect(hook.result.current.totalCount).toBeUndefined();
		expect(asked).toHaveLength(2);
	});
});
