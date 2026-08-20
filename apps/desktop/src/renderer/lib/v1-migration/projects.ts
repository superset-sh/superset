import type { HostServiceClient } from "renderer/lib/host-service-client";
import { getBaseName } from "renderer/lib/pathBasename";

export interface V1ProjectLike {
	id: string;
	name: string;
	mainRepoPath: string;
	githubOwner: string | null;
	/** v1 accent color: a `#rrggbb` hex or the "default" sentinel. */
	color?: string | null;
	/** v1 "hide the GitHub avatar" flag — carries as the "none" icon. */
	hideImage?: boolean | null;
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
				// Coordinates from the candidate the host just handed us: a
				// `remote` candidate has no local row on this host, so setup
				// has no other way to learn the repo.
				origin: {
					repoCloneUrl: targetCandidate.repoCloneUrl,
					name: targetCandidate.name,
				},
				mode: {
					kind: "import",
					repoPath: project.mainRepoPath,
					allowRelocate,
				},
			});
			await carryV1ProjectAppearance(hostClient, targetCandidate.id, project);
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
	// Only stamp v1 appearance onto projects this call actually created.
	// A reused project (created === false) may carry v2 customizations the
	// user chose after their first import — never overwrite those. Older
	// hosts omit the field; keep their long-standing carry behavior.
	if (result.created !== false) {
		await carryV1ProjectAppearance(hostClient, result.projectId, project);
	}
	return {
		kind: "imported",
		v2ProjectId: result.projectId,
		mainWorkspaceId: result.mainWorkspaceId,
		repoPath: result.repoPath,
	};
}

/**
 * Best-effort: copy v1 appearance onto the imported v2 project — the accent
 * color (v1 stores either a hex or the "default" sentinel; only real hexes
 * carry over) and the hide-avatar flag (v2's "none" icon sentinel). Never
 * fails the import (appearance is cosmetic, and older hosts lack setColor).
 */
async function carryV1ProjectAppearance(
	hostClient: HostServiceClient,
	v2ProjectId: string,
	project: Pick<V1ProjectLike, "color" | "hideImage">,
): Promise<void> {
	const { color } = project;
	if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
		try {
			await hostClient.project.setColor.mutate({
				projectId: v2ProjectId,
				color,
			});
		} catch (err) {
			console.error("[v1-migration] carrying project color failed", {
				v2ProjectId,
				err,
			});
		}
	}
	if (project.hideImage) {
		try {
			await hostClient.project.setIcon.mutate({
				projectId: v2ProjectId,
				icon: "none",
			});
		} catch (err) {
			console.error("[v1-migration] carrying hide-image flag failed", {
				v2ProjectId,
				err,
			});
		}
	}
}
