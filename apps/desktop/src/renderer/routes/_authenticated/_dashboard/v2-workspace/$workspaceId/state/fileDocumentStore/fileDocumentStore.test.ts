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

function createReloadFixture() {
	type ReadResult = {
		kind: "text";
		content: string;
		revision: string;
		byteLength: number;
	};
	const reads: Array<ReturnType<typeof Promise.withResolvers<ReadResult>>> = [];
	let writes = 0;
	const client = {
		filesystem: {
			readFile: {
				query: () => {
					const read = Promise.withResolvers<ReadResult>();
					reads.push(read);
					return read.promise;
				},
			},
			writeFile: {
				mutate: async () => {
					writes += 1;
					return { ok: true, revision: "saved-revision" };
				},
			},
		},
	} as unknown as Parameters<typeof acquireDocument>[2];
	const workspaceId = crypto.randomUUID();
	const absolutePath = "/workspace/.env";
	const doc = acquireDocument(workspaceId, absolutePath, client);
	return {
		doc,
		workspaceId,
		reads,
		get writes() {
			return writes;
		},
		update: () =>
			dispatchFsEvent(workspaceId, { kind: "update", absolutePath }),
		overflow: () =>
			dispatchFsEvent(workspaceId, {
				kind: "overflow",
				absolutePath: "/workspace",
			}),
		remove: () =>
			dispatchFsEvent(workspaceId, { kind: "delete", absolutePath }),
		resolve: async (index: number, content: string) => {
			reads[index].resolve({
				kind: "text",
				content,
				revision: content,
				byteLength: content.length,
			});
			await Promise.resolve();
		},
		cleanup: async () => {
			if (doc.dirty) await doc.save();
			releaseDocument(workspaceId, doc.absolutePath);
		},
	};
}

test("external reload preserves edits made while the disk read is pending", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "EMAIL=original");
	f.update();
	f.doc.setContent("EMAIL=edited");
	await f.resolve(1, "EMAIL=original\nTOKEN=generated");
	expect(f.doc.content).toMatchObject({
		value: "EMAIL=edited",
		revision: "EMAIL=original",
	});
	expect(f.doc.dirty).toBe(true);
	expect(f.doc.hasExternalChange).toBe(true);
	await f.cleanup();
});

test("external reloads cannot complete out of order and restore stale disk content", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	f.update();
	f.update();
	await f.resolve(2, "newest");
	await f.resolve(1, "stale");
	expect(f.doc.content).toMatchObject({ value: "newest", revision: "newest" });
	expect(f.doc.dirty).toBe(false);
	await f.cleanup();
});

test("watcher overflow reloads open files beneath the watched root and preserves dirty buffers", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	f.overflow();
	expect(f.reads).toHaveLength(2);
	await f.resolve(1, "TOKEN=generated");
	expect(f.doc.content).toMatchObject({ value: "TOKEN=generated" });
	f.doc.setContent("EMAIL=edited");
	f.overflow();
	expect(f.doc.content).toMatchObject({ value: "EMAIL=edited" });
	expect(f.doc.hasExternalChange).toBe(true);
	expect(f.reads).toHaveLength(2);
	await f.cleanup();
});

test("a stale reload error cannot replace edits made during the read", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	f.update();
	f.doc.setContent("unsaved");
	f.reads[1].reject(new Error("ENOENT"));
	await Promise.resolve();
	expect(f.doc.content).toMatchObject({ value: "unsaved" });
	expect(f.doc.dirty).toBe(true);
	await f.cleanup();
});

test("a reload started before a save cannot roll back the saved revision", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	f.update();
	f.doc.setContent("saved edits");
	await f.doc.save();
	await f.resolve(1, "original");
	expect(f.doc.content).toMatchObject({
		value: "saved edits",
		revision: "saved-revision",
	});
	expect(f.doc.dirty).toBe(false);
	await f.cleanup();
});

test("a reload started before deletion cannot clear the orphaned state", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	f.update();
	f.remove();
	await f.resolve(1, "original");
	expect(f.doc.orphaned).toBe(true);
	f.update();
	await f.resolve(2, "recreated");
	expect(f.doc.orphaned).toBe(false);
	await f.cleanup();
});

test("a rename during initial load reads the new path instead of leaving the document loading", async () => {
	const f = createReloadFixture();
	dispatchFsEvent(f.workspaceId, {
		kind: "rename",
		oldAbsolutePath: "/workspace/.env",
		absolutePath: "/workspace/.env.local",
	});
	await f.resolve(1, "renamed content");
	await f.resolve(0, "old content");
	expect(f.doc.absolutePath).toBe("/workspace/.env.local");
	expect(f.doc.content).toMatchObject({ value: "renamed content" });
	await f.cleanup();
});

test("an older read failure cannot replace a newer successful reload", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	f.update();
	f.update();
	await f.resolve(2, "newest");
	f.reads[1].reject(new Error("ENOENT"));
	await Promise.resolve();
	expect(f.doc.content).toMatchObject({ value: "newest" });
	await f.cleanup();
});

test("overflow in another workspace does not reload this document", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	dispatchFsEvent(crypto.randomUUID(), {
		kind: "overflow",
		absolutePath: "/workspace",
	});
	expect(f.reads).toHaveLength(1);
	await f.cleanup();
});

test("comparing an external change reads disk without saving or discarding edits", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "EMAIL=original");
	f.doc.setContent("EMAIL=edited");
	f.update();
	const comparing = f.doc.compareWithDisk();
	await f.resolve(1, "EMAIL=original\nTOKEN=generated");
	await comparing;
	expect(f.doc.conflict?.diskContent).toBe("EMAIL=original\nTOKEN=generated");
	expect(f.doc.content).toMatchObject({
		value: "EMAIL=edited",
		revision: "EMAIL=original",
	});
	expect(f.doc.dirty).toBe(true);
	expect(f.writes).toBe(0);
	await f.doc.resolveConflict("keep");
	expect(f.doc.conflict).toBeNull();
	expect(f.doc.hasExternalChange).toBe(true);
	expect(f.doc.dirty).toBe(true);
	expect(f.writes).toBe(0);
	await f.cleanup();
});

test("an unreadable disk version leaves the dirty buffer intact for conflict review", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	f.doc.setContent("unsaved");
	const comparing = f.doc.compareWithDisk();
	f.reads[1].reject(new Error("ENOENT"));
	await comparing;
	expect(f.doc.conflict).toEqual({ diskContent: null });
	expect(f.doc.content).toMatchObject({ value: "unsaved" });
	expect(f.doc.dirty).toBe(true);
	expect(f.writes).toBe(0);
	await f.cleanup();
});

for (const action of ["save", "reload"] as const) {
	test(`a pending comparison cannot reopen a conflict after ${action}`, async () => {
		const f = createReloadFixture();
		await f.resolve(0, "original");
		f.doc.setContent("edited");
		const comparing = f.doc.compareWithDisk();
		if (action === "save") {
			await f.doc.save();
		} else {
			const reloading = f.doc.reload();
			await f.resolve(2, "latest disk");
			await reloading;
		}
		const version = f.doc.getVersion();
		await f.resolve(1, "obsolete disk");
		await comparing;
		expect(f.doc.conflict).toBeNull();
		expect(f.doc.getVersion()).toBe(version);
		expect(f.doc.content).toMatchObject({
			value: action === "save" ? "edited" : "latest disk",
		});
		expect(f.doc.dirty).toBe(false);
		await f.cleanup();
	});
}

test("directory rename preserves a dirty descendant document", async () => {
	const workspaceId = crypto.randomUUID();
	const doc = acquireDocument(workspaceId, "/workspace/src/file.txt", {
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
	} as unknown as Parameters<typeof acquireDocument>[2]);
	await Promise.resolve();
	doc.setContent("unsaved");
	dispatchFsEvent(workspaceId, {
		kind: "rename",
		oldAbsolutePath: "/workspace/src",
		absolutePath: "/workspace/dest",
		isDirectory: true,
	});
	expect(doc.absolutePath).toBe("/workspace/dest/file.txt");
	expect(doc.content).toMatchObject({ value: "unsaved" });
	expect(getDocument(workspaceId, "/workspace/dest/file.txt")?.id).toBe(doc.id);
	doc.setContent("original");
	releaseDocument(workspaceId, doc.absolutePath);
});

test("duplicate rename events do not reload the already-moved document", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	const event = {
		kind: "rename" as const,
		oldAbsolutePath: "/workspace/.env",
		absolutePath: "/workspace/.env.local",
	};
	dispatchFsEvent(f.workspaceId, event);
	dispatchFsEvent(f.workspaceId, event);
	expect(f.reads).toHaveLength(3);
	await f.resolve(1, "renamed");
	await f.resolve(2, "renamed");
	expect(f.reads).toHaveLength(3);
	expect(f.doc.content).toMatchObject({ value: "renamed" });
	expect(f.doc.absolutePath).toBe("/workspace/.env.local");
	await f.cleanup();
});

test("an atomic save renamed over an open clean document reloads it", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	dispatchFsEvent(f.workspaceId, {
		kind: "rename",
		oldAbsolutePath: "/workspace/.env.tmp",
		absolutePath: "/workspace/.env",
	});
	await f.resolve(1, "saved elsewhere");
	expect(f.reads).toHaveLength(3);
	await f.resolve(2, "saved elsewhere");
	expect(f.doc.content).toMatchObject({ value: "saved elsewhere" });
	await f.cleanup();
});

test("an atomic save renamed over an open dirty document flags the external change", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	f.doc.setContent("edited");
	dispatchFsEvent(f.workspaceId, {
		kind: "rename",
		oldAbsolutePath: "/workspace/.env.tmp",
		absolutePath: "/workspace/.env",
	});
	await f.resolve(1, "saved elsewhere");
	expect(f.doc.hasExternalChange).toBe(true);
	expect(f.doc.content).toMatchObject({ value: "edited" });
	await f.cleanup();
});

test("the watcher echo of a move keeps a dirty buffer free of external-change flags", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	f.doc.setContent("edited");
	const event = {
		kind: "rename" as const,
		oldAbsolutePath: "/workspace/.env",
		absolutePath: "/workspace/.env.local",
	};
	dispatchFsEvent(f.workspaceId, event);
	dispatchFsEvent(f.workspaceId, event);
	await f.resolve(1, "original");
	expect(f.doc.hasExternalChange).toBe(false);
	expect(f.doc.content).toMatchObject({ value: "edited" });
	await f.cleanup();
});

test("a replacement arriving from the old path after a move is still detected", async () => {
	const f = createReloadFixture();
	await f.resolve(0, "original");
	f.doc.setContent("edited");
	const move = {
		kind: "rename" as const,
		oldAbsolutePath: "/workspace/.env",
		absolutePath: "/workspace/.env.local",
	};
	dispatchFsEvent(f.workspaceId, move);
	dispatchFsEvent(f.workspaceId, move);
	await f.resolve(1, "replacement written at the old path");
	expect(f.doc.hasExternalChange).toBe(true);
	expect(f.doc.content).toMatchObject({ value: "edited" });
	await f.cleanup();
});
