import { expect, test } from "bun:test";
import { acquireDocument, releaseDocument } from "./fileDocumentStore";

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
