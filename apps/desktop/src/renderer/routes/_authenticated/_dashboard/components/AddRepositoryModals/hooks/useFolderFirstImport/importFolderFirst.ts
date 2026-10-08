import type { HostServiceClient } from "renderer/lib/host-service-client";
import { getBaseName } from "renderer/lib/pathBasename";
import type { ProjectSetupResult } from "renderer/react-query/projects";

export interface MatchingProject {
	id: string;
	name: string;
}

export type FolderImportClient = {
	project: Pick<
		HostServiceClient["project"],
		"findByPath" | "setup" | "create"
	>;
};

export interface ImportFolderFirstDeps {
	pickDirectory: () => Promise<{ canceled: boolean; path?: string | null }>;
	waitForHostReady: () => Promise<string | null>;
	getClient: (hostUrl: string) => FolderImportClient;
	requestGitInit: (repoPath: string) => Promise<boolean>;
	finalizeSetup: (hostUrl: string, result: ProjectSetupResult) => void;
	onError?: (message: string) => void;
	onMultipleProjects?: (input: { candidates: MatchingProject[] }) => void;
	messages: {
		hostUnavailable: () => string;
		cloudUnreachable: (first: { url: string; message: string }) => string;
		multipleProjects: (candidates: MatchingProject[]) => string;
	};
}

export async function importFolderFirst({
	pickDirectory,
	waitForHostReady,
	getClient,
	requestGitInit,
	finalizeSetup,
	onError,
	onMultipleProjects,
	messages,
}: ImportFolderFirstDeps): Promise<ProjectSetupResult | null> {
	// Pick the folder first — the native dialog is a local Electron call and
	// must not wait on the host service. Only the registration below needs it.
	let repoPath: string;
	try {
		const picked = await pickDirectory();
		if (picked.canceled || !picked.path) return null;
		repoPath = picked.path;
	} catch (err) {
		onError?.(err instanceof Error ? err.message : String(err));
		return null;
	}

	const activeHostUrl = await waitForHostReady();
	if (!activeHostUrl) {
		onError?.(messages.hostUnavailable());
		return null;
	}

	const client = getClient(activeHostUrl);
	let candidates: MatchingProject[];
	try {
		const response = await client.project.findByPath.query({ repoPath });

		// Folder isn't a git repo yet: offer to `git init` it, then import
		// via the create path with init enabled.
		if ("needsGitInit" in response && response.needsGitInit) {
			const confirmed = await requestGitInit(repoPath);
			if (!confirmed) return null;
			const result = await client.project.create.mutate({
				name: getBaseName(repoPath),
				mode: { kind: "importLocal", repoPath, initIfNeeded: true },
			});
			finalizeSetup(activeHostUrl, result);
			return result;
		}

		candidates = response.candidates;
		if (candidates.length === 0 && response.cloudErrors.length > 0) {
			onError?.(messages.cloudUnreachable(response.cloudErrors[0]));
			return null;
		}
	} catch (err) {
		onError?.(err instanceof Error ? err.message : String(err));
		return null;
	}

	const [only, ...rest] = candidates;
	if (rest.length > 0) {
		if (onMultipleProjects) {
			onMultipleProjects({ candidates });
		} else {
			onError?.(messages.multipleProjects(candidates));
		}
		return null;
	}

	try {
		let result: ProjectSetupResult;
		if (only) {
			const setupResult = await client.project.setup.mutate({
				projectId: only.id,
				mode: { kind: "import", repoPath },
			});
			result = {
				projectId: only.id,
				repoPath: setupResult.repoPath,
			};
		} else {
			result = await client.project.create.mutate({
				name: getBaseName(repoPath),
				mode: { kind: "importLocal", repoPath },
			});
		}
		finalizeSetup(activeHostUrl, result);
		return result;
	} catch (err) {
		onError?.(err instanceof Error ? err.message : String(err));
		return null;
	}
}
