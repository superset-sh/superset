import { beforeEach, describe, expect, mock, test } from "bun:test";
// Static import so the real module is captured before the mock below replaces it.
import * as reactActual from "react";

let rawQueryResult: {
	data?: {
		content: string;
		byteLength: number;
		exceededLimit: boolean;
		revision: string;
	};
	error?: Error;
	isLoading: boolean;
};

const readFileUseQuery = mock(
	(_input: unknown, options: { enabled: boolean }) =>
		options.enabled
			? rawQueryResult
			: { data: undefined, error: undefined, isLoading: false },
);
const emptyUseQuery = mock(() => ({ data: undefined, isLoading: false }));

// Spread the real module: bun's mock.module is process-global and permanent,
// so dropping an export here deletes it for every test file that runs after
// this one. `useMemo` runs eagerly so the hook can be exercised outside a
// render.
mock.module("react", () => ({
	...reactActual,
	useMemo: <T>(factory: () => T) => factory(),
}));

mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		changes: {
			getBranches: { useQuery: emptyUseQuery },
			getGitFileContents: { useQuery: emptyUseQuery },
			getGitOriginalContent: { useQuery: emptyUseQuery },
		},
		filesystem: {
			readFile: { useQuery: readFileUseQuery },
		},
	},
}));

const { FILE_CONTENT_GC_TIME_MS, FILE_CONTENT_STALE_TIME_MS, useFileContent } =
	await import("./useFileContent");

describe("useFileContent", () => {
	beforeEach(() => {
		rawQueryResult = { isLoading: true };
		readFileUseQuery.mockClear();
	});

	test("keeps exact-workspace cached file content visible during a refresh", () => {
		rawQueryResult = {
			data: {
				content: "cached content",
				byteLength: 14,
				exceededLimit: false,
				revision: "revision-1",
			},
			isLoading: true,
		};

		const result = useFileContent({
			workspaceId: "workspace-1",
			worktreePath: "/worktrees/one",
			filePath: "/worktrees/one/README.md",
			viewMode: "raw",
		});

		expect(result.rawFileData).toEqual({
			ok: true,
			content: "cached content",
			truncated: false,
			byteLength: 14,
		});
		expect(result.isLoadingRaw).toBe(false);
		expect(readFileUseQuery).toHaveBeenNthCalledWith(
			1,
			{
				workspaceId: "workspace-1",
				absolutePath: "/worktrees/one/README.md",
				encoding: "utf-8",
				maxBytes: 2 * 1024 * 1024,
			},
			expect.objectContaining({
				enabled: true,
				gcTime: FILE_CONTENT_GC_TIME_MS,
				staleTime: FILE_CONTENT_STALE_TIME_MS,
			}),
		);
	});

	test("shows initial loading only when no cached file data exists", () => {
		const result = useFileContent({
			workspaceId: "workspace-2",
			worktreePath: "/worktrees/two",
			filePath: "/worktrees/two/README.md",
			viewMode: "raw",
		});

		expect(result.rawFileData).toBeUndefined();
		expect(result.isLoadingRaw).toBe(true);
	});
});
