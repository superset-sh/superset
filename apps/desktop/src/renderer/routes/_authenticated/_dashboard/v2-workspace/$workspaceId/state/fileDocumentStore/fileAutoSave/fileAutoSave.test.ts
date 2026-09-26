import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import type { FsService } from "@superset/workspace-fs/client";
import {
	acquireDocument,
	dispatchFsEvent,
	getDocument,
	getDocuments,
	releaseDocument,
	subscribeDocuments,
} from "../fileDocumentStore";
import type { SharedFileDocument } from "../types";
import { FileAutoSaveController } from "./fileAutoSave";

type FsWriteResult = Awaited<ReturnType<FsService["writeFile"]>>;

const timers = new Map<number, () => void>();
let nextTimer = 0;
let restoreTimers: () => void;
let stop: () => void;
let controller: FileAutoSaveController;
const documents: SharedFileDocument[] = [];
const workspaceIds = new Set<string>();

async function settle() {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

async function fireTimers() {
	const pending = [...timers.values()];
	timers.clear();
	for (const callback of pending) callback();
	await settle();
}

beforeEach(() => {
	const set = spyOn(globalThis, "setTimeout").mockImplementation(((
		callback: () => void,
		delay: number,
	) => {
		expect(delay).toBe(3000);
		const id = ++nextTimer;
		timers.set(id, callback);
		return id;
	}) as typeof setTimeout);
	const clear = spyOn(globalThis, "clearTimeout").mockImplementation((id) => {
		timers.delete(Number(id));
	});
	restoreTimers = () => {
		set.mockRestore();
		clear.mockRestore();
	};
	controller = new FileAutoSaveController({
		getDocuments: () =>
			getDocuments().filter((document) =>
				workspaceIds.has(document.workspaceId),
			),
		subscribeDocuments,
	});
	stop = controller.start();
});

afterEach(async () => {
	stop();
	for (const document of documents.splice(0)) {
		await document.reload();
		releaseDocument(document.workspaceId, document.absolutePath);
	}
	workspaceIds.clear();
	timers.clear();
	restoreTimers();
});

async function open(
	write: (input: { content: string }) => Promise<FsWriteResult> = async () => ({
		ok: true,
		revision: "r2",
	}),
) {
	const writes = mock(write);
	const workspaceId = crypto.randomUUID();
	workspaceIds.add(workspaceId);
	const document = acquireDocument(workspaceId, "/file.txt", {
		filesystem: {
			readFile: {
				query: async () => ({
					kind: "text",
					content: "original",
					revision: "r1",
					byteLength: 8,
				}),
			},
			writeFile: { mutate: writes },
		},
	} as unknown as Parameters<typeof acquireDocument>[2]);
	documents.push(document);
	await settle();
	return { document, writes };
}

describe("document auto save", () => {
	test("a stale released read cannot evict its replacement or detach auto save", async () => {
		controller.setMode("afterDelay");
		const workspaceId = crypto.randomUUID();
		workspaceIds.add(workspaceId);
		const oldRead = Promise.withResolvers<{
			kind: "text";
			content: string;
			revision: string;
			byteLength: number;
		}>();
		const read = {
			kind: "text" as const,
			content: "original",
			revision: "r1",
			byteLength: 8,
		};
		let reads = 0;
		const writes = mock(async () => ({ ok: true, revision: "r2" }));
		const client = {
			filesystem: {
				readFile: {
					query: () =>
						++reads === 1 ? oldRead.promise : Promise.resolve(read),
				},
				writeFile: { mutate: writes },
			},
		} as unknown as Parameters<typeof acquireDocument>[2];
		const old = acquireDocument(workspaceId, "/replacement.txt", client);
		releaseDocument(workspaceId, old.absolutePath);
		const replacement = acquireDocument(workspaceId, old.absolutePath, client);
		documents.push(replacement);
		await settle();
		oldRead.resolve(read);
		await settle();
		expect(getDocument(workspaceId, old.absolutePath)?.id).toBe(replacement.id);
		expect(replacement.id).not.toBe(old.id);
		replacement.setContent("newer document edit");
		await fireTimers();
		expect(writes).toHaveBeenCalledTimes(1);
		expect(replacement.dirty).toBe(false);
	});

	test("release keeps a pending write even if an edit temporarily returns to the saved content", async () => {
		const write = Promise.withResolvers<FsWriteResult>();
		const { document } = await open(() => write.promise);
		document.setContent("saving");
		const saved = document.save();
		document.setContent("original");
		releaseDocument(document.workspaceId, document.absolutePath);
		expect(getDocument(document.workspaceId, document.absolutePath)?.id).toBe(
			document.id,
		);
		write.resolve({ ok: true, revision: "r2" });
		await saved;
		expect(document.dirty).toBe(true);
	});

	test("saves dirty documents after all panes release them and removes the clean unleased entry", async () => {
		controller.setMode("afterDelay");
		const { document, writes } = await open();
		document.setContent("inactive workspace edit");
		releaseDocument(document.workspaceId, document.absolutePath);
		expect(timers.size).toBe(1);
		await fireTimers();
		expect(writes).toHaveBeenCalledTimes(1);
		expect(writes.mock.calls[0]?.[0].content).toBe("inactive workspace edit");
		expect(document.dirty).toBe(false);
		expect(getDocument(document.workspaceId, document.absolutePath)).toBeNull();
	});

	test("window blur saves dirty documents in different inactive workspaces", async () => {
		controller.setMode("onWindowChange");
		const a = await open();
		const b = await open();
		for (const { document } of [a, b]) {
			document.setContent("background edit");
			releaseDocument(document.workspaceId, document.absolutePath);
		}
		controller.onWindowChange();
		await settle();
		expect(a.writes).toHaveBeenCalledTimes(1);
		expect(b.writes).toHaveBeenCalledTimes(1);
	});

	test("debounces rapid edits and reschedules newer content after an in-flight save", async () => {
		controller.setMode("afterDelay");
		const first = Promise.withResolvers<FsWriteResult>();
		let calls = 0;
		const { document, writes } = await open(async () =>
			++calls === 1 ? first.promise : { ok: true, revision: "r3" },
		);
		document.setContent("one");
		document.setContent("two");
		expect(timers.size).toBe(1);
		await fireTimers();
		document.setContent("three");
		releaseDocument(document.workspaceId, document.absolutePath);
		expect(timers.size).toBe(0);
		first.resolve({ ok: true, revision: "r2" });
		await settle();
		expect(timers.size).toBe(1);
		await fireTimers();
		expect(writes.mock.calls.map(([input]) => input.content)).toEqual([
			"two",
			"three",
		]);
		expect(document.dirty).toBe(false);
	});

	test.each([
		"onFocusChange",
		"onWindowChange",
	] as const)("queues %s during an in-flight save", async (mode) => {
		controller.setMode(mode);
		const first = Promise.withResolvers<FsWriteResult>();
		let calls = 0;
		const { document, writes } = await open(async () =>
			++calls === 1 ? first.promise : { ok: true, revision: "r3" },
		);
		const trigger = () =>
			mode === "onFocusChange"
				? controller.onFocusChange(document)
				: controller.onWindowChange();
		document.setContent("one");
		trigger();
		document.setContent("two");
		trigger();
		expect(writes).toHaveBeenCalledTimes(1);
		first.resolve({ ok: true, revision: "r2" });
		await settle();
		expect(writes.mock.calls.map(([input]) => input.content)).toEqual([
			"one",
			"two",
		]);
		expect(document.dirty).toBe(false);
	});

	test("keeps auto save suspended after conflict Cancel, even after typing or switching modes", async () => {
		controller.setMode("afterDelay");
		let conflict = true;
		const { document, writes } = await open(async () =>
			conflict
				? { ok: false, reason: "conflict", currentRevision: "disk" }
				: { ok: true, revision: "r2" },
		);
		document.setContent("edit");
		await fireTimers();
		expect(document.conflict).not.toBeNull();
		await document.resolveConflict("keep");
		document.setContent("still editing");
		await fireTimers();
		controller.setMode("onWindowChange");
		controller.onWindowChange();
		expect(writes).toHaveBeenCalledTimes(1);
		expect(document.conflict).toBeNull();
		conflict = false;
		await document.save();
		document.setContent("next edit");
		controller.onWindowChange();
		await settle();
		expect(writes).toHaveBeenCalledTimes(3);
	});

	test("does not retry failed saves after dismiss; explicit retry restores auto save", async () => {
		controller.setMode("afterDelay");
		let online = false;
		const { document, writes } = await open(async () => {
			if (!online) throw new Error("Host disconnected");
			return { ok: true, revision: "r2" };
		});
		document.setContent("edit");
		await fireTimers();
		expect(document.dirty).toBe(true);
		expect(document.saveError?.message).toBe("Host disconnected");
		document.clearSaveError();
		document.setContent("newer edit");
		await fireTimers();
		expect(writes).toHaveBeenCalledTimes(1);
		online = true;
		await document.save();
		document.setContent("next edit");
		await fireTimers();
		expect(writes).toHaveBeenCalledTimes(3);
	});

	test("Off cancels timers and orphaned documents are never automatically written", async () => {
		controller.setMode("afterDelay");
		const { document, writes } = await open();
		document.setContent("edit");
		controller.setMode("off");
		await fireTimers();
		controller.onWindowChange();
		expect(writes).toHaveBeenCalledTimes(0);
		controller.setMode("afterDelay");
		dispatchFsEvent(document.workspaceId, {
			kind: "delete",
			absolutePath: document.absolutePath,
		});
		await fireTimers();
		expect(writes).toHaveBeenCalledTimes(0);
		expect(document.dirty).toBe(true);
	});
});
