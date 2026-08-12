import { afterEach, describe, expect, it } from "bun:test";
import { useAddRepositoryModalStore } from "./add-repository-modal";

describe("add repository modal store", () => {
	afterEach(() => {
		useAddRepositoryModalStore.getState().close();
	});

	it("opens the empty-project flow and resolves the created project", async () => {
		const resultPromise = useAddRepositoryModalStore
			.getState()
			.openEmptyProject();

		expect(useAddRepositoryModalStore.getState().active).toEqual({
			kind: "empty-project",
		});

		useAddRepositoryModalStore
			.getState()
			.resolveNewProject({ projectId: "project-1" });

		expect(await resultPromise).toEqual({ projectId: "project-1" });
		expect(useAddRepositoryModalStore.getState().active).toEqual({
			kind: "none",
		});
	});

	it("resolves with null when the empty-project flow is closed", async () => {
		const resultPromise = useAddRepositoryModalStore
			.getState()
			.openEmptyProject();

		useAddRepositoryModalStore.getState().close();

		expect(await resultPromise).toBeNull();
	});
});
