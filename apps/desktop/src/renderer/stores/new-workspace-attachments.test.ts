import { beforeEach, describe, expect, it } from "bun:test";
import {
	newWorkspaceAttachmentPaths,
	newWorkspaceAttachmentsStore,
} from "./new-workspace-attachments";
import { useNewWorkspaceDraftStore } from "./new-workspace-draft";

const imageFile = {
	id: "file-1",
	type: "file" as const,
	url: "blob:renderer/one",
	mediaType: "image/png",
	filename: "one.png",
};

describe("newWorkspaceAttachmentsStore", () => {
	beforeEach(() => {
		newWorkspaceAttachmentsStore.set([]);
		newWorkspaceAttachmentPaths.clear();
	});

	it("retains files independent of any mounted provider", () => {
		newWorkspaceAttachmentsStore.set([imageFile]);
		expect(newWorkspaceAttachmentsStore.get()).toEqual([imageFile]);
	});

	it("keeps files across non-reset draft updates", () => {
		newWorkspaceAttachmentsStore.set([imageFile]);
		useNewWorkspaceDraftStore.getState().updateDraft({ prompt: "hello" });
		expect(newWorkspaceAttachmentsStore.get()).toEqual([imageFile]);
	});

	it("clears files, revokes blob URLs, and drops source paths on draft reset", () => {
		const revoked: string[] = [];
		const original = URL.revokeObjectURL;
		URL.revokeObjectURL = (url: string) => {
			revoked.push(url);
		};
		try {
			newWorkspaceAttachmentsStore.set([imageFile]);
			newWorkspaceAttachmentPaths.set("one.png", "/tmp/one.png");

			useNewWorkspaceDraftStore.getState().resetDraft();

			expect(newWorkspaceAttachmentsStore.get()).toEqual([]);
			expect(revoked).toEqual(["blob:renderer/one"]);
			expect(newWorkspaceAttachmentPaths.size).toBe(0);
		} finally {
			URL.revokeObjectURL = original;
		}
	});

	it("notifies subscribers when files change", () => {
		let calls = 0;
		const unsubscribe = newWorkspaceAttachmentsStore.subscribe(() => {
			calls += 1;
		});
		newWorkspaceAttachmentsStore.set([imageFile]);
		expect(calls).toBe(1);
		unsubscribe();
		newWorkspaceAttachmentsStore.set([]);
		expect(calls).toBe(1);
	});
});
