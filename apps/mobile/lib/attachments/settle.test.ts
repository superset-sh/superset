import { beforeEach, describe, expect, test } from "bun:test";
import { useComposerDraftsStore } from "@/screens/(authenticated)/stores/composerDraftsStore";
import { waitForSettledUploads } from "./settle";

const KEY = "workspace:test";

const attach = (...ids: string[]) => {
	useComposerDraftsStore.getState().addAttachments(
		KEY,
		ids.map((id) => ({ id, type: "file" as const, uri: `file:///${id}` })),
	);
};

beforeEach(() => {
	useComposerDraftsStore.setState({ draftsByKey: {} });
});

describe("waitForSettledUploads", () => {
	test("an upload that already has an id needs no waiting", async () => {
		attach("a");
		useComposerDraftsStore.getState().finishUpload(KEY, "a", "file-a");

		expect(await waitForSettledUploads(KEY, ["a"])).toMatchObject({
			a: { fileId: "file-a" },
		});
	});

	test("waits for one still in flight, then reports it", async () => {
		attach("a");
		const settled = waitForSettledUploads(KEY, ["a"]);

		useComposerDraftsStore.getState().setUploadProgress(KEY, "a", 0.4);
		useComposerDraftsStore.getState().finishUpload(KEY, "a", "file-a");

		expect(await settled).toMatchObject({ a: { fileId: "file-a" } });
	});

	test("a failure settles too — the send reports it rather than hanging", async () => {
		attach("a");
		const settled = waitForSettledUploads(KEY, ["a"]);

		useComposerDraftsStore.getState().failUpload(KEY, "a", "no connection");

		expect(await settled).toMatchObject({ a: { error: "no connection" } });
	});

	test("waits on every named attachment, not just the first", async () => {
		attach("a", "b");
		let done = false;
		const settled = waitForSettledUploads(KEY, ["a", "b"]).then((value) => {
			done = true;
			return value;
		});

		useComposerDraftsStore.getState().finishUpload(KEY, "a", "file-a");
		await Promise.resolve();
		expect(done).toBe(false);

		useComposerDraftsStore.getState().finishUpload(KEY, "b", "file-b");
		expect(await settled).toMatchObject({
			a: { fileId: "file-a" },
			b: { fileId: "file-b" },
		});
	});

	test("an attachment removed mid-send stops being waited on", async () => {
		attach("a");
		const settled = waitForSettledUploads(KEY, ["a"]);

		useComposerDraftsStore.getState().removeAttachment(KEY, "a");

		expect(await settled).toEqual({});
	});

	// The regression this was written for: a retry restarts the upload, which
	// clears the error. Reading a snapshot taken before the restart made the
	// send resolve immediately against the very failure it was retrying.
	test("a restarted upload is not settled by its previous error", async () => {
		attach("a");
		const store = useComposerDraftsStore.getState();
		store.failUpload(KEY, "a", "no connection");
		store.beginUpload(KEY, "a");

		let done = false;
		const settled = waitForSettledUploads(KEY, ["a"]).then((value) => {
			done = true;
			return value;
		});
		await Promise.resolve();
		expect(done).toBe(false);

		store.finishUpload(KEY, "a", "file-a");
		expect(await settled).toMatchObject({ a: { fileId: "file-a" } });
	});
});

describe("beginUpload", () => {
	test("clears the previous failure so a retry is in flight, not settled", () => {
		attach("a");
		const store = useComposerDraftsStore.getState();
		store.setUploadProgress(KEY, "a", 0.8);
		store.failUpload(KEY, "a", "no connection");
		store.beginUpload(KEY, "a");

		const entry = useComposerDraftsStore.getState().draftsByKey[KEY]?.uploads.a;
		expect(entry).toEqual({ progress: 0, fileId: undefined, error: undefined });
	});

	test("ignores an attachment the draft no longer holds", () => {
		attach("a");
		useComposerDraftsStore.getState().removeAttachment(KEY, "a");
		useComposerDraftsStore.getState().beginUpload(KEY, "a");

		expect(useComposerDraftsStore.getState().draftsByKey[KEY]?.uploads).toEqual(
			{},
		);
	});
});
