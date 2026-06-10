import { beforeEach, describe, expect, it, mock } from "bun:test";

const hostUrl = "http://host-service";
const repoPath = "/repos/octocat";
const setupResult = {
	repoPath,
	mainWorkspaceId: "workspace-1",
};
const hydratedProject = {
	id: "project-1",
	organizationId: "org-1",
	name: "Octocat",
	slug: "octocat",
	repoCloneUrl: "https://github.com/octocat/hello.git",
	githubRepositoryId: null,
	iconUrl: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};
const hydratedWorkspace = {
	id: "workspace-1",
	organizationId: "org-1",
	projectId: "project-1",
	hostId: "host-1",
	name: "main",
	branch: "main",
	type: "main",
	createdByUserId: "user-1",
	taskId: null,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};
const cloudError = {
	url: "https://github.com/octocat/hello.git",
	message: "cloud-down",
};

const selectDirectoryMock = mock(async () => ({
	canceled: false,
	path: repoPath,
}));
const findByPathMock = mock(
	async (): Promise<{
		candidates: { id: string; name: string }[];
		cloudErrors: (typeof cloudError)[];
		needsGitInit?: boolean;
	}> => ({
		candidates: [],
		cloudErrors: [],
	}),
);
const setupMock = mock(async () => setupResult);
const createMock = mock(async () => ({
	projectId: "created-project",
	repoPath,
	mainWorkspaceId: "workspace-created",
}));
const finalizeSetupMock = mock(() => undefined);
const requestGitInitMock = mock(async () => false);

mock.module("react", () => ({
	default: {
		createElement: () => null,
		forwardRef: <T extends (...args: never[]) => unknown>(render: T) => render,
	},
	createElement: () => null,
	forwardRef: <T extends (...args: never[]) => unknown>(render: T) => render,
	useCallback: <T extends (...args: never[]) => unknown>(callback: T) =>
		callback,
}));

mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		window: {
			selectDirectory: {
				useMutation: () => ({ mutateAsync: selectDirectoryMock }),
			},
		},
	},
}));

mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({
		project: {
			findByPath: { query: findByPathMock },
			setup: { mutate: setupMock },
			create: { mutate: createMock },
		},
	}),
}));

mock.module("renderer/lib/host-service-unavailable", () => ({
	getHostServiceUnavailableMessage: () => "Host service is unavailable",
}));

mock.module("renderer/react-query/projects", () => ({
	useFinalizeProjectSetup: () => finalizeSetupMock,
}));

mock.module(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
	() => ({
		useLocalHostService: () => ({ activeHostUrl: hostUrl }),
	}),
);

mock.module("renderer/stores/git-init-confirm", () => ({
	useRequestGitInitConfirm: () => requestGitInitMock,
}));

const { useFolderFirstImport } = await import("./useFolderFirstImport");

describe("useFolderFirstImport", () => {
	beforeEach(() => {
		for (const fn of [
			selectDirectoryMock,
			findByPathMock,
			setupMock,
			createMock,
			finalizeSetupMock,
			requestGitInitMock,
		]) {
			fn.mockClear();
		}
		findByPathMock.mockResolvedValue({ candidates: [], cloudErrors: [] });
		setupMock.mockResolvedValue(setupResult);
		createMock.mockResolvedValue({
			projectId: "created-project",
			repoPath,
			mainWorkspaceId: "workspace-created",
		});
		requestGitInitMock.mockResolvedValue(false);
	});

	it("reports cloud lookup errors instead of creating a duplicate local import when no candidates exist", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [],
			cloudErrors: [cloudError],
		});
		const onError = mock(() => undefined);

		const result = await useFolderFirstImport({ onError }).start();

		expect(result).toBeNull();
		expect(findByPathMock).toHaveBeenCalledWith({ repoPath });
		expect(onError).toHaveBeenCalledWith(
			"Couldn't reach cloud for https://github.com/octocat/hello.git: cloud-down",
		);
		expect(createMock).not.toHaveBeenCalled();
		expect(setupMock).not.toHaveBeenCalled();
		expect(finalizeSetupMock).not.toHaveBeenCalled();
	});

	it("imports with init after the user confirms a non-git folder", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [],
			cloudErrors: [],
			needsGitInit: true,
		});
		requestGitInitMock.mockResolvedValue(true);
		const onError = mock(() => undefined);

		const result = await useFolderFirstImport({ onError }).start();

		expect(requestGitInitMock).toHaveBeenCalledWith(repoPath);
		expect(createMock).toHaveBeenCalledWith({
			name: "octocat",
			mode: { kind: "importLocal", repoPath, initIfNeeded: true },
		});
		expect(finalizeSetupMock).toHaveBeenCalledWith(hostUrl, {
			projectId: "created-project",
			repoPath,
			mainWorkspaceId: "workspace-created",
		});
		expect(result).toEqual({
			projectId: "created-project",
			repoPath,
			mainWorkspaceId: "workspace-created",
		});
		expect(onError).not.toHaveBeenCalled();
	});

	it("does nothing when the user cancels the git-init confirmation", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [],
			cloudErrors: [],
			needsGitInit: true,
		});
		requestGitInitMock.mockResolvedValue(false);
		const onError = mock(() => undefined);

		const result = await useFolderFirstImport({ onError }).start();

		expect(result).toBeNull();
		expect(requestGitInitMock).toHaveBeenCalledWith(repoPath);
		expect(createMock).not.toHaveBeenCalled();
		expect(finalizeSetupMock).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
	});

	it("preserves setup project and main workspace rows for immediate sidebar hydration", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [{ id: "project-1", name: "Octocat" }],
			cloudErrors: [],
		});
		setupMock.mockResolvedValue({
			...setupResult,
			project: hydratedProject,
			mainWorkspace: hydratedWorkspace,
		});
		const onError = mock(() => undefined);

		const result = await useFolderFirstImport({ onError }).start();

		const expected = {
			projectId: "project-1",
			repoPath,
			mainWorkspaceId: "workspace-1",
			project: hydratedProject,
			mainWorkspace: hydratedWorkspace,
		};
		expect(setupMock).toHaveBeenCalledWith({
			projectId: "project-1",
			mode: { kind: "import", repoPath },
		});
		expect(finalizeSetupMock).toHaveBeenCalledWith(hostUrl, expected);
		expect(result).toEqual(expected);
		expect(onError).not.toHaveBeenCalled();
	});
});
