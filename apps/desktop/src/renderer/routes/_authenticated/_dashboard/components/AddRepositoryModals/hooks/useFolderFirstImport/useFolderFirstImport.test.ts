import { beforeEach, describe, expect, it, mock } from "bun:test";

const hostUrl = "http://host-service";
const repoPath = "/repos/octocat";
const setupResult = {
	repoPath,
	mainWorkspaceId: "workspace-1",
};
const cloudError = {
	url: "https://github.com/octocat/hello.git",
	message: "cloud-down",
};
const localCandidate = { id: "local-project", name: "octocat" };

const selectDirectoryMock = mock(async () => ({
	canceled: false,
	path: repoPath,
}));
const findByPathMock = mock(async () => ({
	candidates: [] as (typeof localCandidate)[],
	cloudErrors: [] as (typeof cloudError)[],
}));
const setupMock = mock(async () => setupResult);
const createMock = mock(async () => ({
	projectId: "created-project",
	repoPath,
	mainWorkspaceId: "workspace-created",
}));
const finalizeSetupMock = mock(() => undefined);

mock.module("react", () => ({
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

mock.module("renderer/react-query/projects", () => ({
	useFinalizeProjectSetup: () => finalizeSetupMock,
}));

mock.module(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
	() => ({
		useLocalHostService: () => ({ activeHostUrl: hostUrl }),
	}),
);

const { useFolderFirstImport } = await import("./useFolderFirstImport");

describe("useFolderFirstImport", () => {
	beforeEach(() => {
		for (const fn of [
			selectDirectoryMock,
			findByPathMock,
			setupMock,
			createMock,
			finalizeSetupMock,
		]) {
			fn.mockClear();
		}
		findByPathMock.mockResolvedValue({ candidates: [], cloudErrors: [] });
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

	it("keeps folder-first candidate import flowing even when the lookup response includes cloud errors", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [localCandidate],
			cloudErrors: [cloudError],
		});
		const onError = mock(() => undefined);

		const result = await useFolderFirstImport({ onError }).start();

		expect(result).toEqual({
			projectId: "local-project",
			repoPath: "/repos/octocat",
			mainWorkspaceId: "workspace-1",
		});
		expect(setupMock).toHaveBeenCalledWith({
			projectId: "local-project",
			mode: { kind: "import", repoPath },
		});
		expect(createMock).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
		expect(finalizeSetupMock).toHaveBeenCalledWith(hostUrl, {
			projectId: "local-project",
			repoPath,
			mainWorkspaceId: "workspace-1",
		});
	});
});
