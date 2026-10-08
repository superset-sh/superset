import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import type { CodeViewItem } from "@pierre/diffs";
import type { AppRouter } from "@superset/host-service/trpc";
import type { TRPCLink } from "@trpc/client";
import type { ReactNode } from "react";
import type { ChangesetFile } from "../../../../../useChangeset";
import type { DiffAnnotationMetadata } from "../useDiffAnnotations";

const reactActGlobal = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactActGlobal.IS_REACT_ACT_ENVIRONMENT;
reactActGlobal.IS_REACT_ACT_ENVIRONMENT = true;

/** What the fake host answers `git.getDiffPatch` with, per category. */
const patchByCategory = new Map<string, string>();
/** Set to hold the next request open until the test releases it. */
let holdNextRequest: (() => void) | null = null;
const getDiffPatch = mock(async (input: { category: string }) => {
	if (holdNextRequest) {
		const release = holdNextRequest;
		holdNextRequest = null;
		await new Promise<void>((resolve) => {
			releaseHeldRequest = () => {
				release();
				resolve();
			};
		});
	}
	return { patch: patchByCategory.get(input.category) ?? "" };
});
let releaseHeldRequest: () => void = () => {};

const { act, cleanup, renderHook, waitFor } = await import(
	"@testing-library/react"
);
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { observable } = await import("@trpc/server/observable");
const { workspaceTrpc } = await import("@superset/workspace-client");
const { useDiffCodeViewItems } = await import("./useDiffCodeViewItems");

const hostLink: TRPCLink<AppRouter> = () => (call) =>
	observable((observer) => {
		void getDiffPatch(call.op.input as { category: string }).then((data) => {
			observer.next({ result: { data } });
			observer.complete();
		});
	});

function hostWrapper(client: InstanceType<typeof QueryClient>) {
	const trpcClient = workspaceTrpc.createClient({ links: [hostLink] });
	return ({ children }: { children: ReactNode }) => (
		<workspaceTrpc.Provider client={trpcClient} queryClient={client}>
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		</workspaceTrpc.Provider>
	);
}

const FILE_A = [
	"diff --git a/a.ts b/a.ts",
	"index 0000001..0000002 100644",
	"--- a/a.ts",
	"+++ b/a.ts",
	"@@ -1,2 +1,2 @@",
	" const shared = 1;",
	"-const a = 1;",
	"+const a = 2;",
	"",
].join("\n");

const FILE_B = [
	"diff --git a/b.ts b/b.ts",
	"index 0000003..0000004 100644",
	"--- a/b.ts",
	"+++ b/b.ts",
	"@@ -1,1 +1,2 @@",
	" const b = 1;",
	"+const added = 2;",
	"",
].join("\n");

const FILE_B_EDITED = FILE_B.replace("+const added = 2;", "+const added = 3;");

function lockfilePatch(name: string): string {
	return [
		`diff --git a/${name} b/${name}`,
		"index 0000005..0000006 100644",
		`--- a/${name}`,
		`+++ b/${name}`,
		"@@ -1,1 +1,1 @@",
		"-lockfile v1",
		"+lockfile v2",
		"",
	].join("\n");
}

const BUN_LOCK = lockfilePatch("bun.lock");
const YARN_LOCK = lockfilePatch("yarn.lock");

const EMPTY_SET: ReadonlySet<string> = new Set();
const EMPTY_MAP = new Map<string, never>();

function unstagedFile(
	path: string,
	status: ChangesetFile["status"] = "modified",
): ChangesetFile {
	return {
		path,
		status,
		additions: 1,
		deletions: 1,
		source: { kind: "unstaged" },
	};
}

function sortedPaths(
	call: unknown[] | undefined,
	key: "paths" | "untrackedPaths",
) {
	const input = call?.[0] as Record<
		"paths" | "untrackedPaths",
		string[] | undefined
	>;
	return [...(input[key] ?? [])].sort();
}

function options(files: ChangesetFile[]) {
	return {
		workspaceId: "workspace-1",
		files,
		collapsedSet: EMPTY_SET,
		editingSet: EMPTY_SET,
		editorRevisionByItemId: EMPTY_MAP,
		annotationsByPath: EMPTY_MAP,
	};
}

function diffItem(items: CodeViewItem<DiffAnnotationMetadata>[], path: string) {
	const item = items.find(
		(candidate) => candidate.id === `diff:unstaged:${path}`,
	);
	if (item?.type !== "diff") throw new Error(`${path} has no diff item yet`);
	return item;
}

function renderItems(files: ChangesetFile[]) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const wrapper = hostWrapper(client);
	const rendered = renderHook(
		(props: Parameters<typeof useDiffCodeViewItems>[0]) =>
			useDiffCodeViewItems(props),
		{ wrapper, initialProps: options(files) },
	);
	return { client, ...rendered };
}

beforeEach(() => {
	patchByCategory.clear();
	getDiffPatch.mockClear();
	holdNextRequest = null;
});

afterEach(cleanup);

afterAll(async () => {
	reactActGlobal.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

describe("useDiffCodeViewItems", () => {
	test("a refetch where only file B changed keeps file A's cacheKey and version", async () => {
		patchByCategory.set("unstaged", FILE_A + FILE_B);
		const { client, result } = renderItems([
			unstagedFile("a.ts"),
			unstagedFile("b.ts"),
		]);
		await waitFor(() => diffItem(result.current.items, "b.ts"));
		const a = diffItem(result.current.items, "a.ts");
		const b = diffItem(result.current.items, "b.ts");

		patchByCategory.set("unstaged", FILE_A + FILE_B_EDITED);
		await act(() => client.invalidateQueries());
		await waitFor(() =>
			expect(diffItem(result.current.items, "b.ts").version).not.toBe(
				b.version,
			),
		);

		const after = diffItem(result.current.items, "a.ts");
		expect(after.fileDiff).toBe(a.fileDiff);
		expect(after.fileDiff.cacheKey).toBe(a.fileDiff.cacheKey);
		expect(after.version).toBe(a.version);
		expect(diffItem(result.current.items, "b.ts").fileDiff.cacheKey).not.toBe(
			b.fileDiff.cacheKey,
		);
	});

	test("a refetch where file B is removed keeps file A", async () => {
		patchByCategory.set("unstaged", FILE_A + FILE_B);
		const { client, result, rerender } = renderItems([
			unstagedFile("a.ts"),
			unstagedFile("b.ts"),
		]);
		await waitFor(() => diffItem(result.current.items, "b.ts"));
		const a = diffItem(result.current.items, "a.ts");

		patchByCategory.set("unstaged", FILE_A);
		rerender(options([unstagedFile("a.ts")]));
		await act(() => client.invalidateQueries());
		await waitFor(() => expect(getDiffPatch).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(client.isFetching()).toBe(0));

		expect(result.current.items).toHaveLength(1);
		const after = diffItem(result.current.items, "a.ts");
		expect(after.fileDiff).toBe(a.fileDiff);
		expect(after.version).toBe(a.version);
		expect(client.getQueryCache().getAll()).toHaveLength(1);
	});

	test("two panes that opted into different generated files share one entry without looping", async () => {
		patchByCategory.set("unstaged", FILE_A + BUN_LOCK + YARN_LOCK);
		const files = [
			unstagedFile("a.ts"),
			unstagedFile("bun.lock"),
			unstagedFile("yarn.lock"),
		];
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const wrapper = hostWrapper(client);
		const paneA = renderHook(() => useDiffCodeViewItems(options(files)), {
			wrapper,
		});
		const paneB = renderHook(() => useDiffCodeViewItems(options(files)), {
			wrapper,
		});
		await waitFor(() => diffItem(paneA.result.current.items, "a.ts"));
		await waitFor(() => diffItem(paneB.result.current.items, "a.ts"));
		const callsBeforeOptIn = getDiffPatch.mock.calls.length;

		act(() => paneA.result.current.requestDiff("diff:unstaged:bun.lock"));
		act(() => paneB.result.current.requestDiff("diff:unstaged:yarn.lock"));
		await waitFor(() => diffItem(paneA.result.current.items, "bun.lock"));
		await waitFor(() => diffItem(paneB.result.current.items, "yarn.lock"));
		await new Promise((resolve) => setTimeout(resolve, 150));

		expect(client.getQueryCache().getAll()).toHaveLength(1);
		expect(getDiffPatch.mock.calls.length - callsBeforeOptIn).toBeLessThan(4);
		const lastInput = getDiffPatch.mock.calls.at(-1)?.[0] as {
			paths?: string[];
		};
		expect([...(lastInput.paths ?? [])].sort()).toEqual([
			"a.ts",
			"bun.lock",
			"yarn.lock",
		]);
	});

	test("a pane joining while the first request is pending gets one follow-up with both panes' files", async () => {
		patchByCategory.set("unstaged", FILE_A + FILE_B);
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const wrapper = hostWrapper(client);
		holdNextRequest = () => {};
		const paneA = renderHook(
			() => useDiffCodeViewItems(options([unstagedFile("a.ts")])),
			{ wrapper },
		);
		await waitFor(() => expect(getDiffPatch).toHaveBeenCalledTimes(1));
		const paneB = renderHook(
			() =>
				useDiffCodeViewItems(
					options([unstagedFile("a.ts"), unstagedFile("b.ts")]),
				),
			{ wrapper },
		);
		expect(getDiffPatch).toHaveBeenCalledTimes(1);

		await act(async () => releaseHeldRequest());
		await waitFor(() => diffItem(paneB.result.current.items, "b.ts"));
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(getDiffPatch).toHaveBeenCalledTimes(2);
		expect(sortedPaths(getDiffPatch.mock.calls[1], "paths")).toEqual([
			"a.ts",
			"b.ts",
		]);
		expect(diffItem(paneA.result.current.items, "a.ts")).toBeTruthy();
	});

	test("a file staged since the fetch moves lists and is fetched again in the right one", async () => {
		patchByCategory.set("unstaged", FILE_A + FILE_B);
		const { result, rerender } = renderItems([
			unstagedFile("a.ts"),
			unstagedFile("b.ts", "untracked"),
		]);
		await waitFor(() => diffItem(result.current.items, "b.ts"));
		expect(sortedPaths(getDiffPatch.mock.calls[0], "untrackedPaths")).toEqual([
			"b.ts",
		]);

		rerender(options([unstagedFile("a.ts"), unstagedFile("b.ts", "modified")]));
		await waitFor(() => expect(getDiffPatch).toHaveBeenCalledTimes(2));
		await new Promise((resolve) => setTimeout(resolve, 100));

		expect(getDiffPatch).toHaveBeenCalledTimes(2);
		expect(sortedPaths(getDiffPatch.mock.calls[1], "paths")).toEqual([
			"a.ts",
			"b.ts",
		]);
		expect(sortedPaths(getDiffPatch.mock.calls[1], "untrackedPaths")).toEqual(
			[],
		);
	});

	test("a file joining the changeset refetches the same cache entry", async () => {
		patchByCategory.set("unstaged", FILE_A);
		const { client, result, rerender } = renderItems([unstagedFile("a.ts")]);
		await waitFor(() => diffItem(result.current.items, "a.ts"));
		const a = diffItem(result.current.items, "a.ts");

		patchByCategory.set("unstaged", FILE_A + FILE_B);
		rerender(options([unstagedFile("a.ts"), unstagedFile("b.ts")]));
		await waitFor(() => diffItem(result.current.items, "b.ts"));

		expect(getDiffPatch).toHaveBeenCalledTimes(2);
		expect(getDiffPatch.mock.calls[1]?.[0]).toMatchObject({
			paths: ["a.ts", "b.ts"],
		});
		expect(client.getQueryCache().getAll()).toHaveLength(1);
		expect(diffItem(result.current.items, "a.ts").version).toBe(a.version);
	});
});
