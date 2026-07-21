import type { HostServiceClient } from "renderer/lib/host-service-client";
import { getBaseName } from "renderer/lib/pathBasename";

export interface V1ProjectLike {
	id: string;
	name: string;
	mainRepoPath: string;
	githubOwner: string | null;
}

export type ProjectFindByPathResult = Awaited<
	ReturnType<HostServiceClient["project"]["findByPath"]["query"]>
>;

export type ProjectImportOutcome =
	| {
			kind: "imported";
			v2ProjectId: string;
			mainWorkspaceId: string | null;
			repoPath: string;
	  }
	| { kind: "needs-relocate"; v2ProjectId: string; message: string };

export type ProjectImportDecision =
	| { kind: "already-imported"; v2ProjectId: string }
	| { kind: "import" }
	| { kind: "skip"; reason: "multiple-candidates" | "cloud-unreachable" };

/**
 * Decide what to do with a v1 project from its findByPath result. Mirrors
 * the wizard's "Import all" rules: a `local-path` candidate means the repo
 * is already a v2 project on this host; multiple cloud candidates need a
 * human to pick; cloud errors with no candidate mean we can't tell whether
 * a legacy cloud project exists, so don't risk creating a duplicate.
 */
export function decideProjectImport(
	result: Pick<ProjectFindByPathResult, "candidates" | "cloudErrors">,
): ProjectImportDecision {
	const local = result.candidates.find((c) => c.source === "local-path");
	if (local) return { kind: "already-imported", v2ProjectId: local.id };
	if (result.candidates.length > 1) {
		return { kind: "skip", reason: "multiple-candidates" };
	}
	if (result.candidates.length === 0 && result.cloudErrors.length > 0) {
		return { kind: "skip", reason: "cloud-unreachable" };
	}
	return { kind: "import" };
}

export function isProjectAlreadyImported(
	findByPathResult: ProjectFindByPathResult | undefined,
): boolean {
	return !!findByPathResult?.candidates.find((c) => c.source === "local-path");
}

export function expectedRemoteUrlFor(
	project: Pick<V1ProjectLike, "mainRepoPath" | "githubOwner">,
): string | undefined {
	if (!project.githubOwner) return undefined;
	const repoName = getBaseName(project.mainRepoPath);
	if (!repoName) return undefined;
	return `https://github.com/${project.githubOwner}/${repoName}`;
}

export function findProjectByPath(
	hostClient: HostServiceClient,
	project: V1ProjectLike,
): Promise<ProjectFindByPathResult> {
	return hostClient.project.findByPath.query({
		repoPath: project.mainRepoPath,
		walkAllRemotes: true,
		expectedRemoteUrl: expectedRemoteUrlFor(project),
	});
}

export function isAlreadySetUpElsewhereError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	return err.message.includes("Project is already set up on this device at");
}

export function extractExistingPath(message: string): string | null {
	const match = message.match(
		/already set up on this device at (.+?)\.\s+Remove/,
	);
	return match?.[1] ?? null;
}

/**
 * Import one v1 project into v2: link it onto an existing v2 project
 * candidate via `project.setup`, or create a fresh local-first project via
 * `project.create {kind:'importLocal'}`. Pure host-service calls — UI side
 * effects (sidebar, query invalidation) are the caller's job.
 */
export async function importV1Project({
	hostClient,
	project,
	findByPathResult,
	linkToProjectId,
	allowRelocate = false,
}: {
	hostClient: HostServiceClient;
	project: V1ProjectLike;
	findByPathResult: ProjectFindByPathResult | undefined;
	linkToProjectId?: string;
	allowRelocate?: boolean;
}): Promise<ProjectImportOutcome> {
	const candidates = findByPathResult?.candidates ?? [];

	const targetCandidate = linkToProjectId
		? candidates.find((c) => c.id === linkToProjectId)
		: candidates[0];

	if (linkToProjectId && !targetCandidate) {
		throw new Error(
			"Selected v2 project is no longer in the candidate list. Refresh and pick again.",
		);
	}

	if (targetCandidate) {
		try {
			const result = await hostClient.project.setup.mutate({
				projectId: targetCandidate.id,
				mode: {
					kind: "import",
					repoPath: project.mainRepoPath,
					allowRelocate,
				},
			});
			return {
				kind: "imported",
				v2ProjectId: targetCandidate.id,
				mainWorkspaceId: result.mainWorkspaceId,
				repoPath: result.repoPath,
			};
		} catch (err) {
			if (isAlreadySetUpElsewhereError(err) && !allowRelocate) {
				return {
					kind: "needs-relocate",
					v2ProjectId: targetCandidate.id,
					message: err instanceof Error ? err.message : String(err),
				};
			}
			throw err;
		}
	}

	const result = await hostClient.project.create.mutate({
		name: project.name,
		mode: { kind: "importLocal", repoPath: project.mainRepoPath },
	});
	return {
		kind: "imported",
		v2ProjectId: result.projectId,
		mainWorkspaceId: result.mainWorkspaceId,
		repoPath: result.repoPath,
	};
}
