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
		useLocalHostService: () => ({
			activeHostUrl: hostUrl,
			waitForHostReady: async () => hostUrl,
		}),
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

	// Reproduces #5894 ("not opening at all"): a newly onboarded v2 user who
	// picks an empty folder gets stuck on the onboarding screen. An empty folder
	// isn't a git repo, so the flow asks the user to confirm `git init` via the
	// shared git-init-confirm store. That request is only answered when a mounted
	// GitInitConfirmDialog calls resolve() — but the dialog was mounted only under
	// the dashboard layout, never on the onboarding route, so the promise never
	// settled and start() hung with the page's `busy` flag stuck on. We model the
	// unmounted (never-answering) dialog with a confirm promise we control.
	it("blocks on an empty folder until the git-init confirm is answered (#5894)", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [],
			cloudErrors: [],
			needsGitInit: true,
		});

		let answerConfirm!: (confirmed: boolean) => void;
		const confirm = new Promise<boolean>((resolve) => {
			answerConfirm = resolve;
		});
		requestGitInitMock.mockReturnValue(confirm);
		const onError = mock(() => undefined);

		let settled = false;
		const startPromise = useFolderFirstImport({ onError })
			.start()
			.then((result) => {
				settled = true;
				return result;
			});

		// Let the flow advance to the git-init confirmation step.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(requestGitInitMock).toHaveBeenCalledWith(repoPath);

		// No dialog is mounted to answer the confirm, so start() never settles —
		// this is the stuck onboarding screen from the bug report.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(settled).toBe(false);
		expect(createMock).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();

		// A dialog reachable from the onboarding route (the fix) answers the
		// confirm and the import completes.
		answerConfirm(true);
		const result = await startPromise;

		expect(settled).toBe(true);
		expect(createMock).toHaveBeenCalledWith({
			name: "octocat",
			mode: { kind: "importLocal", repoPath, initIfNeeded: true },
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
});
