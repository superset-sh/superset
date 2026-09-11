import { beforeEach, describe, expect, test } from "bun:test";
import {
	QueryClient,
	QueryClientProvider,
	useQueryClient,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { pageCommentKeys } from "../../lib/pageCommentKeys";
import { CloudClientProvider } from "../../providers/CloudClientProvider";
import type { CloudCaller, ServerThread } from "../../types";
import { usePageComments } from "./usePageComments";

const PAGE_ID = "page-1";
const user = { id: "u1", name: "Ada", image: null };
const queryKey = pageCommentKeys.list(PAGE_ID);

function serverThread(id: string, commentId: string): ServerThread {
	return {
		id,
		anchorKind: "element",
		anchor: null,
		anchorText: null,
		intent: null,
		resolved: false,
		createdAt: new Date(),
		version: 1,
		createdByUserId: "u1",
		comments: [
			{
				id: commentId,
				body: "from server",
				authorKind: "human",
				authorUserId: "u1",
				authorName: "Ada",
				authorImage: null,
				createdAt: new Date(),
			},
		],
	} as ServerThread;
}

function makeCaller(
	overrides: Partial<CloudCaller["pageComment"]> = {},
	serverRows: ServerThread[] = [],
) {
	return {
		pageComment: {
			list: async () => serverRows,
			create: async () => serverThread("server-1", "server-c1"),
			reply: async () => ({
				id: "server-c2",
				body: "reply",
				authorKind: "human",
				authorUserId: "u1",
				authorName: "Ada",
				authorImage: null,
				createdAt: new Date(),
			}),
			edit: async () => undefined,
			resolve: async () => undefined,
			delete: async () => undefined,
			...overrides,
		},
	} as unknown as CloudCaller;
}

function setup(caller: CloudCaller, seed?: ServerThread[]) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	if (seed) queryClient.setQueryData(queryKey, seed);

	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>
			<CloudClientProvider caller={caller}>{children}</CloudClientProvider>
		</QueryClientProvider>
	);

	const { result } = renderHook(
		() => ({
			store: usePageComments({ pageId: PAGE_ID, version: 1, user }),
			client: useQueryClient(),
		}),
		{ wrapper },
	);
	return { result, queryClient };
}

function rows(queryClient: QueryClient): ServerThread[] | undefined {
	return queryClient.getQueryData<ServerThread[]>(queryKey);
}

describe("usePageComments", () => {
	let errors: unknown[];
	beforeEach(() => {
		errors = [];
	});

	test("swaps the optimistic thread for the server row on success", async () => {
		const created = serverThread("server-1", "server-c1");
		const { result, queryClient } = setup(makeCaller({}, [created]), []);

		await act(async () => {
			await result.current.store.createThread({
				anchor: { path: "p", tag: "p", text: "p", offsetX: 0, offsetY: 0 },
				anchorText: "x",
				body: "hello",
			});
		});

		await waitFor(() => {
			expect(rows(queryClient)?.[0]?.id).toBe("server-1");
		});
	});

	test("restores the previous rows when a mutation fails", async () => {
		const existing = serverThread("t1", "c1");
		const caller = makeCaller(
			{
				create: async () => {
					throw new Error("nope");
				},
			},
			[existing],
		);
		const { result, queryClient } = setup(caller, [existing]);

		await act(async () => {
			await result.current.store
				.createThread({
					anchor: { path: "p", tag: "p", text: "p", offsetX: 0, offsetY: 0 },
					anchorText: "x",
					body: "hello",
				})
				.catch((error) => errors.push(error));
		});

		expect(errors).toHaveLength(1);
		await waitFor(() => {
			expect(rows(queryClient)?.map((row) => row.id)).toEqual(["t1"]);
		});
	});

	test("does not strand the optimistic row when the cache was never populated", async () => {
		const caller = makeCaller({
			create: async () => {
				throw new Error("nope");
			},
		});
		const { result, queryClient } = setup(caller);
		expect(rows(queryClient)).toBeUndefined();

		await act(async () => {
			await result.current.store
				.createThread({
					anchor: { path: "p", tag: "p", text: "p", offsetX: 0, offsetY: 0 },
					anchorText: "x",
					body: "hello",
				})
				.catch((error) => errors.push(error));
		});

		await waitFor(() => {
			expect(rows(queryClient) ?? []).toHaveLength(0);
		});
	});

	test("reports submitting while a mutation is in flight", async () => {
		let release: (() => void) | undefined;
		const seeded = serverThread("t1", "c1");
		const caller = makeCaller(
			{
				resolve: async () => {
					await new Promise<void>((resolve) => {
						release = resolve;
					});
				},
			},
			[seeded],
		);
		const { result } = setup(caller, [seeded]);

		expect(result.current.store.submitting).toBe(false);
		act(() => {
			void result.current.store.setResolved("t1", true);
		});
		await waitFor(() => expect(result.current.store.submitting).toBe(true));

		await act(async () => {
			release?.();
		});
		await waitFor(() => expect(result.current.store.submitting).toBe(false));
	});
});
