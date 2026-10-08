import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import {
	type ProjectSetupResult,
	useFinalizeProjectSetup,
} from "renderer/react-query/projects";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useRequestGitInitConfirm } from "renderer/stores/git-init-confirm";
import { importFolderFirst, type MatchingProject } from "./importFolderFirst";

export interface UseFolderFirstImportResult {
	start: () => Promise<ProjectSetupResult | null>;
}

export function useFolderFirstImport(options?: {
	onError?: (message: string) => void;
	onMultipleProjects?: (input: { candidates: MatchingProject[] }) => void;
}): UseFolderFirstImportResult {
	const { t } = useLingui();
	const hostService = useLocalHostService();
	const { waitForHostReady } = hostService;
	const finalizeSetup = useFinalizeProjectSetup();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const requestGitInit = useRequestGitInitConfirm();
	const { onError, onMultipleProjects } = options ?? {};

	const start = useCallback(
		() =>
			importFolderFirst({
				pickDirectory: () =>
					selectDirectory.mutateAsync({
						title: t({
							message: "Import existing folder",
						}),
					}),
				waitForHostReady: () => waitForHostReady(),
				getClient: getHostServiceClientByUrl,
				requestGitInit,
				finalizeSetup,
				onError,
				onMultipleProjects,
				messages: {
					hostUnavailable: () =>
						getHostServiceUnavailableMessage(hostService, {
							action: "importFolder",
						}),
					cloudUnreachable: (first) =>
						t({
							message: `Couldn't reach cloud for ${first.url}: ${first.message}`,
						}),
					multipleProjects: (candidates) =>
						t({
							message: `Multiple projects use this repository (${candidates.length}). Open the project you want from settings to set it up on this device.`,
						}),
				},
			}),
		[
			waitForHostReady,
			finalizeSetup,
			hostService,
			onError,
			onMultipleProjects,
			requestGitInit,
			selectDirectory,
			t,
		],
	);

	return { start };
}
