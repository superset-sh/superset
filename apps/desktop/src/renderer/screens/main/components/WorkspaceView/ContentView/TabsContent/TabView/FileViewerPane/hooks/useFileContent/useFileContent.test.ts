import { afterEach, describe, expect, test } from "bun:test";
import type { TRPCLink } from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";
import type { ReactNode } from "react";

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
const { FILE_CONTENT_GC_TIME_MS, FILE_CONTENT_STALE_TIME_MS, useFileContent } =
	await import("./useFileContent");

afterEach(cleanup);
function renderFileContent(answerRead: (attempt: number) => unknown) {
	const reads: unknown[] = [];
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			if (call.op.path !== "filesystem.readFile") return;
			reads.push(call.op.input);
			const answer = answerRead(reads.length);
			if (answer === undefined) return;
			observer.next({ result: { data: answer } });
			observer.complete();
		});
	const queryClient = new QueryClient();
	const client = electronTrpc.createClient({ links: [link] });
	const view = renderHook(
		() =>
			useFileContent({
				workspaceId: "workspace-1",
				worktreePath: "/worktrees/one",
				filePath: "/worktrees/one/README.md",
				viewMode: "raw",
			}),
		{
			wrapper: ({ children }: { children: ReactNode }) =>
				createElement(electronTrpc.Provider, { client, queryClient, children }),
		},
	);
	return { queryClient, reads, view };
}

describe("useFileContent", () => {
	test("keeps exact-workspace cached file content visible during a refresh", async () => {
		const { queryClient, reads, view } = renderFileContent((attempt) =>
			attempt === 1
				? {
						content: "cached content",
						byteLength: 14,
						exceededLimit: false,
						revision: "revision-1",
					}
				: undefined,
		);
		await waitFor(() => expect(view.result.current.rawFileData).toBeDefined());

		act(() => {
			void queryClient.invalidateQueries();
		});
		await waitFor(() => expect(reads).toHaveLength(2));

		expect(view.result.current.rawFileData).toEqual({
			ok: true,
			content: "cached content",
			truncated: false,
			byteLength: 14,
		});
		expect(view.result.current.isLoadingRaw).toBe(false);
		expect(reads[0]).toEqual({
			workspaceId: "workspace-1",
			absolutePath: "/worktrees/one/README.md",
			encoding: "utf-8",
			maxBytes: 2 * 1024 * 1024,
		});
		const query = queryClient
			.getQueryCache()
			.getAll()
			.find((cached) => cached.state.data !== undefined);
		expect(query?.options.gcTime).toBe(FILE_CONTENT_GC_TIME_MS);
		expect(query?.observers[0]?.options.staleTime).toBe(
			FILE_CONTENT_STALE_TIME_MS,
		);
	});

	test("shows initial loading only when no cached file data exists", async () => {
		const { reads, view } = renderFileContent(() => undefined);
		await waitFor(() => expect(reads).toHaveLength(1));

		expect(view.result.current.rawFileData).toBeUndefined();
		expect(view.result.current.isLoadingRaw).toBe(true);
	});
});
