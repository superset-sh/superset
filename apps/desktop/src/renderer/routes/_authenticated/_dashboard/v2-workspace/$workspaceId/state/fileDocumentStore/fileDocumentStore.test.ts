import { expect, test } from "bun:test";
import {
	acquireDocument,
	dispatchFsEvent,
	getDocument,
	releaseDocument,
} from "./fileDocumentStore";

test("a failed host save preserves the dirty document across pane reopen and explicit retry", async () => {
	let online = false;
	let writes = 0;
	const client = {
		filesystem: {
			readFile: {
				query: async () => ({
					kind: "text",
					content: "original",
					revision: "revision-1",
					byteLength: 8,
				}),
			},
			writeFile: {
				mutate: async () => {
					writes++;
					if (!online) throw new Error("Host disconnected");
					return { ok: true, revision: "revision-2" };
				},
			},
		},
	} as unknown as Parameters<typeof acquireDocument>[2];
	const workspaceId = crypto.randomUUID();
	const path = "/workspace/reconnect.txt";
	const doc = acquireDocument(workspaceId, path, client);
	await Promise.resolve();
	expect(doc.content.kind).toBe("text");
	doc.setContent("unsaved work");
	expect((await doc.save()).status).toBe("error");
	expect(doc.saveError?.message).toBe("Host disconnected");
	expect(doc.pendingSave).toBe(false);
	expect(doc.dirty).toBe(true);
	expect(doc.content).toMatchObject({ value: "unsaved work" });
	releaseDocument(workspaceId, path);

	const reopened = acquireDocument(workspaceId, path, client);
	expect(reopened.id).toBe(doc.id);
	expect(reopened.dirty).toBe(true);
	online = true;
	expect(writes).toBe(1);
	expect((await reopened.save()).status).toBe("saved");
	expect(reopened.dirty).toBe(false);
	expect(reopened.saveError).toBeNull();
	expect(reopened.content).toMatchObject({ value: "unsaved work" });
	expect(writes).toBe(2);
	releaseDocument(workspaceId, path);
});

test("directory rename preserves descendant identity and dirty buffers through save and reopen", async () => {
	const writes: { absolutePath: string; content: string }[] = [];
	const client = {
		filesystem: {
			readFile: {
				query: async () => ({
					kind: "text",
					content: "original",
					revision: "r1",
					byteLength: 8,
				}),
			},
			writeFile: {
				mutate: async (input: { absolutePath: string; content: string }) => {
					writes.push(input);
					return { ok: true, revision: "r2" };
				},
			},
		},
	} as unknown as Parameters<typeof acquireDocument>[2];
	const workspaceId = crypto.randomUUID();
	const otherWorkspaceId = crypto.randomUUID();
	const doc = acquireDocument(workspaceId, "/repo/src/nested/file.txt", client);
	const sibling = acquireDocument(
		workspaceId,
		"/repo/src-other/file.txt",
		client,
	);
	const other = acquireDocument(
		otherWorkspaceId,
		"/repo/src/nested/file.txt",
		client,
	);
	await Promise.resolve();
	doc.setContent("unsaved buffer");
	const version = doc.getVersion();
	dispatchFsEvent(workspaceId, {
		kind: "rename",
		oldAbsolutePath: "/repo/src",
		absolutePath: "/repo/dest",
		isDirectory: true,
	});
	expect(doc.absolutePath).toBe("/repo/dest/nested/file.txt");
	expect(doc.getVersion()).toBeGreaterThan(version);
	expect(doc.dirty).toBe(true);
	expect(doc.content).toMatchObject({ value: "unsaved buffer" });
	expect(getDocument(workspaceId, "/repo/src/nested/file.txt")).toBeNull();
	expect(getDocument(workspaceId, doc.absolutePath)?.id).toBe(doc.id);
	expect(sibling.absolutePath).toBe("/repo/src-other/file.txt");
	expect(other.absolutePath).toBe("/repo/src/nested/file.txt");
	expect((await doc.save()).status).toBe("saved");
	expect(writes).toMatchObject([
		{ absolutePath: "/repo/dest/nested/file.txt", content: "unsaved buffer" },
	]);
	const reopened = acquireDocument(workspaceId, doc.absolutePath, client);
	expect(reopened.id).toBe(doc.id);
	expect(reopened.content).toMatchObject({ value: "unsaved buffer" });
	releaseDocument(workspaceId, doc.absolutePath);
	releaseDocument(workspaceId, doc.absolutePath);
	releaseDocument(workspaceId, sibling.absolutePath);
	releaseDocument(otherWorkspaceId, other.absolutePath);
});

test("file rename still follows an exact source without treating it as a directory", async () => {
	const client = {
		filesystem: {
			readFile: {
				query: async () => ({
					kind: "text",
					content: "text",
					revision: "r1",
					byteLength: 4,
				}),
			},
		},
	} as unknown as Parameters<typeof acquireDocument>[2];
	const workspaceId = crypto.randomUUID();
	const doc = acquireDocument(workspaceId, "/repo/file.txt", client);
	await Promise.resolve();
	dispatchFsEvent(workspaceId, {
		kind: "rename",
		oldAbsolutePath: "/repo/file.txt",
		absolutePath: "/repo/moved.txt",
		isDirectory: false,
	});
	expect(doc.absolutePath).toBe("/repo/moved.txt");
	expect(doc.content).toMatchObject({ value: "text" });
	releaseDocument(workspaceId, doc.absolutePath);
});

test("confirmed rename clears an earlier delete without losing edits on late or duplicate events", async () => {
	const workspaceId = crypto.randomUUID();
	const client = {
		filesystem: {
			readFile: {
				query: async () => ({
					kind: "text",
					content: "original",
					revision: "r1",
					byteLength: 8,
				}),
			},
		},
	} as unknown as Parameters<typeof acquireDocument>[2];
	const doc = acquireDocument(workspaceId, "/repo/source.txt", client);
	await Promise.resolve();
	doc.setContent("dirty buffer");
	dispatchFsEvent(workspaceId, {
		kind: "delete",
		absolutePath: "/repo/source.txt",
		isDirectory: false,
	});
	expect(doc.orphaned).toBe(true);
	const rename = {
		kind: "rename" as const,
		oldAbsolutePath: "/repo/source.txt",
		absolutePath: "/repo/dest.txt",
		isDirectory: false,
	};
	dispatchFsEvent(workspaceId, rename);
	expect(doc.orphaned).toBe(false);
	expect(doc.absolutePath).toBe("/repo/dest.txt");
	dispatchFsEvent(workspaceId, {
		kind: "create",
		absolutePath: "/repo/dest.txt",
		isDirectory: false,
	});
	dispatchFsEvent(workspaceId, rename);
	expect(doc.absolutePath).toBe("/repo/dest.txt");
	expect(doc.orphaned).toBe(false);
	expect(doc.dirty).toBe(true);
	expect(doc.content).toMatchObject({ value: "dirty buffer" });
	expect(getDocument(workspaceId, "/repo/dest.txt")?.id).toBe(doc.id);
	doc.setContent("original");
	releaseDocument(workspaceId, doc.absolutePath);
});
