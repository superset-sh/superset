import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
	type FolderImportClient,
	type ImportFolderFirstDeps,
	importFolderFirst,
} from "./importFolderFirst";

const hostUrl = "http://host-service";
const repoPath = "/repos/octocat";
const cloudError = {
	url: "https://github.com/octocat/hello.git",
	message: "cloud-down",
};

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
const setupMock = mock(async () => ({ repoPath }));
const createMock = mock(async () => ({
	projectId: "created-project",
	repoPath,
}));
const finalizeSetupMock = mock(() => undefined);
const requestGitInitMock = mock(async () => false);
const clientUrls: string[] = [];

function startImport(overrides: Partial<ImportFolderFirstDeps> = {}) {
	return importFolderFirst({
		pickDirectory: async () => ({ canceled: false, path: repoPath }),
		waitForHostReady: async () => hostUrl,
		getClient: (url) => {
			clientUrls.push(url);
			return {
				project: {
					findByPath: { query: findByPathMock },
					setup: { mutate: setupMock },
					create: { mutate: createMock },
				},
			} as unknown as FolderImportClient;
		},
		requestGitInit: requestGitInitMock,
		finalizeSetup: finalizeSetupMock,
		messages: {
			hostUnavailable: () => "host unavailable",
			cloudUnreachable: (first) =>
				`Couldn't reach cloud for ${first.url}: ${first.message}`,
			multipleProjects: (candidates) => `multiple: ${candidates.length}`,
		},
		...overrides,
	});
}

describe("importFolderFirst", () => {
	beforeEach(() => {
		for (const fn of [
			findByPathMock,
			setupMock,
			createMock,
			finalizeSetupMock,
			requestGitInitMock,
		]) {
			fn.mockClear();
		}
		clientUrls.length = 0;
		findByPathMock.mockResolvedValue({ candidates: [], cloudErrors: [] });
		requestGitInitMock.mockResolvedValue(false);
	});

	it("reports cloud lookup errors instead of creating a duplicate local import when no candidates exist", async () => {
		findByPathMock.mockResolvedValue({
			candidates: [],
			cloudErrors: [cloudError],
		});
		const onError = mock(() => undefined);

		const result = await startImport({ onError });

		expect(result).toBeNull();
		expect(clientUrls).toEqual([hostUrl]);
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

		const result = await startImport({ onError });

		expect(requestGitInitMock).toHaveBeenCalledWith(repoPath);
		expect(createMock).toHaveBeenCalledWith({
			name: "octocat",
			mode: { kind: "importLocal", repoPath, initIfNeeded: true },
		});
		expect(finalizeSetupMock).toHaveBeenCalledWith(hostUrl, {
			projectId: "created-project",
			repoPath,
		});
		expect(result).toEqual({
			projectId: "created-project",
			repoPath,
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

		const result = await startImport({ onError });

		expect(result).toBeNull();
		expect(requestGitInitMock).toHaveBeenCalledWith(repoPath);
		expect(createMock).not.toHaveBeenCalled();
		expect(finalizeSetupMock).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
	});
});
