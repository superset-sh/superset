import { expect, test } from "bun:test";
import { createWorkspaceStore } from "@superset/panes";
import type { FilePaneData, PaneViewerData } from "../../../types";
import {
	acquireDocument,
	dispatchFsEvent,
	releaseDocument,
} from "../fileDocumentStore";
import { renameFilePanePaths } from "./renameFilePanePaths";

test("an inactive descendant pane reopens the same dirty document after a folder move", async () => {
	const store = createWorkspaceStore<PaneViewerData>();
	store.getState().addTab({
		panes: [
			{
				kind: "file",
				data: { mode: "editor", filePath: "/repo/src/nested/child.txt" },
			},
		],
	});
	const inactiveId = store.getState().activeTabId;
	store.getState().addTab({
		panes: [
			{
				kind: "file",
				data: { mode: "editor", filePath: "/repo/src-other/keep.txt" },
			},
		],
	});
	const activeId = store.getState().activeTabId;
	const workspaceId = crypto.randomUUID();
	const client = {
		filesystem: {
			readFile: {
				query: async () => ({
					kind: "text",
					content: "original",
					byteLength: 8,
					revision: "r1",
				}),
			},
		},
	} as unknown as Parameters<typeof acquireDocument>[2];
	const doc = acquireDocument(
		workspaceId,
		"/repo/src/nested/child.txt",
		client,
	);
	await Promise.resolve();
	doc.setContent("dirty inactive buffer");
	releaseDocument(workspaceId, doc.absolutePath);
	const event = {
		kind: "rename" as const,
		oldAbsolutePath: "/repo/src",
		absolutePath: "/repo/dest",
		isDirectory: true,
	};
	dispatchFsEvent(workspaceId, event);
	renameFilePanePaths(store, event);
	expect(store.getState().activeTabId).toBe(activeId);
	const inactive = store.getState().tabs.find((tab) => tab.id === inactiveId);
	if (!inactive) throw new Error("Missing inactive tab");
	const data = Object.values(inactive.panes)[0].data as FilePaneData;
	expect(data.filePath).toBe("/repo/dest/nested/child.txt");
	const reopened = acquireDocument(workspaceId, data.filePath, client);
	expect(reopened.id).toBe(doc.id);
	expect(reopened.content).toMatchObject({ value: "dirty inactive buffer" });
	expect(reopened.dirty).toBe(true);
	const active = store.getState().tabs.find((tab) => tab.id === activeId);
	if (!active) throw new Error("Missing active tab");
	expect(Object.values(active.panes)[0].data).toMatchObject({
		filePath: "/repo/src-other/keep.txt",
	});
	reopened.setContent("original");
	releaseDocument(workspaceId, reopened.absolutePath);
});
