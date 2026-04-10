import { describe, expect, it, mock } from "bun:test";
import { openProjectsAndWorkspaces } from "./open-projects";

describe("openProjectsAndWorkspaces", () => {
	it("opens a main workspace for every imported project", async () => {
		const openNew = mock(async () => [
			{ id: "project-1", name: "Project One" },
			{ id: "project-2", name: "Project Two" },
		]);
		const openMainRepoWorkspace = mock(async () => ({}));
		const onProjectOpenError = mock(() => {});

		await openProjectsAndWorkspaces({
			openNew,
			openMainRepoWorkspace,
			onProjectOpenError,
		});

		expect(openMainRepoWorkspace).toHaveBeenCalledTimes(2);
		expect(openMainRepoWorkspace).toHaveBeenNthCalledWith(1, {
			projectId: "project-1",
		});
		expect(openMainRepoWorkspace).toHaveBeenNthCalledWith(2, {
			projectId: "project-2",
		});
		expect(onProjectOpenError).not.toHaveBeenCalled();
	});

	it("continues opening remaining projects when one workspace creation fails", async () => {
		const openNew = mock(async () => [
			{ id: "project-1", name: "Project One" },
			{ id: "project-2", name: "Project Two" },
		]);
		const expectedError = new Error("workspace create failed");
		const openMainRepoWorkspace = mock(
			async ({ projectId }: { projectId: string }) => {
				if (projectId === "project-1") {
					throw expectedError;
				}
				return {};
			},
		);
		const onProjectOpenError = mock(() => {});

		await openProjectsAndWorkspaces({
			openNew,
			openMainRepoWorkspace,
			onProjectOpenError,
		});

		expect(openMainRepoWorkspace).toHaveBeenCalledTimes(2);
		expect(onProjectOpenError).toHaveBeenCalledTimes(1);
		expect(onProjectOpenError).toHaveBeenCalledWith(
			"Project One",
			expectedError,
		);
	});
});
