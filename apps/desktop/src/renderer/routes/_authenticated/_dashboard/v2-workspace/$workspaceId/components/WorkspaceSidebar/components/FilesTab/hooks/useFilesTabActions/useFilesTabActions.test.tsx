import { afterAll, expect, mock, test } from "bun:test";
import type { FileTree, FileTreeDropResult } from "@pierre/trees";
import { renderToStaticMarkup } from "react-dom/server";
import { FileMoveContext } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/fileDocumentStore/fileMoveContext";
import type { FilesTabBridge } from "../useFilesTabBridge";

let persist: (input: unknown) => Promise<unknown> = async () => undefined;
const showError = mock(() => {});
mock.module("@superset/workspace-client", () => ({
	workspaceTrpc: {
		filesystem: new Proxy(
			{},
			{
				get: () => ({
					useMutation: () => ({
						mutateAsync: (input: unknown) => persist(input),
					}),
				}),
			},
		),
	},
}));
mock.module("@superset/ui/sonner", () => ({ toast: { error: showError } }));
const { useFilesTabActions } = await import("./useFilesTabActions");
afterAll(() => mock.restore());

function setup(paths: string[]) {
	let current = true;
	const onFileMove = mock(() => {});
	const bridge = {
		knownPaths: new Set(paths),
		getVersion: () => 1,
		isCurrent: () => current,
		doRefresh: mock(async () => {}),
		rekeyDescendants: mock(() => {}),
	} as unknown as FilesTabBridge;
	let actions!: ReturnType<typeof useFilesTabActions>;
	function Probe() {
		actions = useFilesTabActions({
			model: {} as FileTree,
			bridge,
			rootPath: "/repo",
			workspaceId: "workspace",
		});
		return null;
	}
	renderToStaticMarkup(
		<FileMoveContext.Provider value={onFileMove}>
			<Probe />
		</FileMoveContext.Provider>,
	);
	return {
		actions,
		bridge,
		onFileMove,
		switchWorkspace: () => {
			current = false;
		},
	};
}

function drop(
	paths: string[],
	directoryPath: string | null,
): FileTreeDropResult {
	return {
		draggedPaths: paths,
		operation: paths.length === 1 ? "move" : "batch",
		target: {
			directoryPath,
			kind: directoryPath ? "directory" : "root",
			hoveredPath: directoryPath,
			flattenedSegmentPath: null,
		},
	};
}

test("same-parent and root no-ops do not persist or refresh", async () => {
	const move = mock(async () => undefined);
	persist = move;
	const { actions, bridge } = setup(["src/file.txt", "root.txt"]);
	await actions.handleMove(drop(["src/file.txt"], "src/"));
	await actions.handleMove(drop(["root.txt"], null));
	expect(move).not.toHaveBeenCalled();
	expect(bridge.doRefresh).not.toHaveBeenCalled();
	expect(bridge.knownPaths.has("src/file.txt")).toBe(true);
});

test("a pending or failed move never records its nonexistent destination", async () => {
	const pending = Promise.withResolvers<unknown>();
	persist = () => pending.promise;
	const { actions, bridge, onFileMove } = setup(["src/file.txt"]);
	const moving = actions.handleMove(drop(["src/file.txt"], "dest/"));
	expect(bridge.knownPaths.has("src/file.txt")).toBe(true);
	expect(bridge.knownPaths.has("dest/file.txt")).toBe(false);
	pending.reject(new Error("EACCES"));
	await moving;
	expect(bridge.knownPaths.has("src/file.txt")).toBe(true);
	expect(bridge.knownPaths.has("dest/file.txt")).toBe(false);
	expect(bridge.doRefresh).toHaveBeenCalledTimes(1);
	expect(showError).toHaveBeenCalled();
	expect(onFileMove).not.toHaveBeenCalled();
});

test("successful moves commit paths only after the disk operation", async () => {
	const pending = Promise.withResolvers<unknown>();
	persist = () => pending.promise;
	const { actions, bridge, onFileMove } = setup(["src/nested/"]);
	const moving = actions.handleMove(drop(["src/nested/"], "dest/"));
	expect(bridge.rekeyDescendants).not.toHaveBeenCalled();
	expect(onFileMove).not.toHaveBeenCalled();
	pending.resolve(undefined);
	await moving;
	expect(onFileMove).toHaveBeenCalledWith({
		kind: "rename",
		oldAbsolutePath: "/repo/src/nested",
		absolutePath: "/repo/dest/nested",
		isDirectory: true,
	});
	expect(bridge.knownPaths.has("src/nested/")).toBe(false);
	expect(bridge.knownPaths.has("dest/nested/")).toBe(true);
	expect(bridge.rekeyDescendants).toHaveBeenCalledWith(
		"src/nested",
		"dest/nested",
	);
});

test("switching workspace during a batch stops subsequent mutations and bookkeeping", async () => {
	const pending = Promise.withResolvers<unknown>();
	const move = mock(() => pending.promise);
	persist = move;
	const { actions, bridge, switchWorkspace } = setup(["src/a", "src/b"]);
	const moving = actions.handleMove(drop(["src/a", "src/b"], "dest/"));
	switchWorkspace();
	pending.resolve(undefined);
	await moving;
	expect(move).toHaveBeenCalledTimes(1);
	expect([...bridge.knownPaths]).toEqual(["src/a", "src/b"]);
	expect(bridge.doRefresh).not.toHaveBeenCalled();
});
