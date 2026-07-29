import { beforeEach, describe, expect, test } from "bun:test";
import type { ChangedFile } from "shared/changes-types";
import { useChangesStore } from "./store";

const someFile = { path: "a.ts" } as ChangedFile;

beforeEach(() => {
	useChangesStore.setState({ selectedFiles: {} });
});

describe("changes-store selectedFiles", () => {
	test("selecting then deselecting removes the workspace key entirely", () => {
		const { selectFile } = useChangesStore.getState();

		selectFile("ws-1", "/tmp/ws-1/a.ts", someFile);
		expect(useChangesStore.getState().selectedFiles["ws-1"]).toBeDefined();

		selectFile("ws-1", null, null);
		expect("ws-1" in useChangesStore.getState().selectedFiles).toBe(false);
	});

	test("deselecting a workspace that has no entry is a no-op", () => {
		const before = useChangesStore.getState().selectedFiles;
		useChangesStore.getState().selectFile("ws-never", null, null);
		expect(useChangesStore.getState().selectedFiles).toBe(before);
	});

	test("reset removes the workspace key entirely", () => {
		const { selectFile, reset } = useChangesStore.getState();

		selectFile("ws-1", "/tmp/ws-1/a.ts", someFile);
		reset("ws-1");

		expect("ws-1" in useChangesStore.getState().selectedFiles).toBe(false);
	});
});
