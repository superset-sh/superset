import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

/**
 * Ensures a v2 cloud project exists for `repoPath`, returning the v2 project
 * id. Used during onboarding to mint the v2_projects row that v2 workspace
 * creation FK-depends on.
 *
 * Strategy:
 *  1. `findByPath` — returns either an existing local sqlite row OR a cloud
 *     match by GitHub remote.
 *  2. If a candidate exists, try `setup({ kind: "import" })` to register the
 *     local mirror against the cloud project.
 *  3. If `setup` throws (typically because the candidate is a *local-only*
 *     sqlite row from a prior `projects.openNew`, with no cloud counterpart),
 *     fall through to `project.create` which creates both the cloud project
 *     and a local sqlite row sharing the same id.
 *
 * Net effect: always returns a v2 cloud project id whose v2_workspaces FK is
 * satisfiable.
 */
export function useEnsureV2Project(): (args: {
	repoPath: string;
	name: string;
}) => Promise<string> {
	const { activeHostUrl } = useLocalHostService();

	return useCallback(
		async ({ repoPath, name }) => {
			if (!activeHostUrl) {
				throw new Error("No active host service");
			}
			const hostService = getHostServiceClientByUrl(activeHostUrl);

			const found = await hostService.project.findByPath.query({ repoPath });
			const candidate = found.candidates[0];
			if (candidate) {
				try {
					await hostService.project.setup.mutate({
						projectId: candidate.id,
						mode: { kind: "import", repoPath },
					});
					return candidate.id;
				} catch (err) {
					// `findByPath` returns local sqlite rows even when no cloud v2
					// project exists for that id; setup → v2Project.get → NOT_FOUND in
					// that case. Fall through to create a fresh v2 project.
					console.warn(
						"[ensureV2Project] setup failed, falling through to create",
						err,
					);
				}
			}

			const created = await hostService.project.create.mutate({
				name,
				mode: { kind: "importLocal", repoPath },
			});
			return created.projectId;
		},
		[activeHostUrl],
	);
}
