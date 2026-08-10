import type {
	ProjectFindByPathResult,
	ProjectImportDecision,
} from "renderer/lib/v1-migration";

/** Per-project import state shared between the Import All batch and the
 * individual rows — the page owns one map of these (like the workspaces
 * page's adoptStates). */
export type ProjectImportStatus =
	| { kind: "idle" }
	| { kind: "running" }
	| { kind: "imported"; v2ProjectId: string }
	| { kind: "error"; message: string }
	| { kind: "needs-relocate"; v2ProjectId: string; message: string };

export const IDLE_IMPORT_STATUS: ProjectImportStatus = { kind: "idle" };

/**
 * Which projects Import All would act on, and what the button's `· N`
 * counts. Pending = importable now (or still loading its findByPath
 * probe) and not already imported/running. Errors stay pending so a
 * re-press retries them; skip decisions (multiple candidates, cloud
 * unreachable) and needs-relocate rows require a human and are excluded.
 */
export function selectPendingProjects<T extends { id: string }>(
	projects: readonly T[],
	decisions: ReadonlyMap<string, ProjectImportDecision | undefined>,
	states: ReadonlyMap<string, ProjectImportStatus>,
): T[] {
	return projects.filter((project) => {
		const state = states.get(project.id)?.kind ?? "idle";
		if (state === "running" || state === "imported") return false;
		if (state === "needs-relocate") return false;
		const decision = decisions.get(project.id);
		if (decision && decision.kind !== "import") return false;
		return true;
	});
}

export type ProjectRowActionPlan =
	| { kind: "running"; label?: string }
	| { kind: "imported"; label: string }
	| { kind: "confirm-relocate"; message: string; disabled: boolean }
	| { kind: "error"; message: string; retry: "import" | "query" }
	| { kind: "pick"; disabled: boolean }
	| { kind: "ready"; label: "Link" | "Import"; disabled: boolean };

/**
 * Pure row-action derivation so batch-interaction rules are unit-testable
 * (this repo has no component-interaction test infra). Mirrors the
 * workspaces page: rows are disabled while Import All runs, and errored
 * rows read "Queued" during a batch instead of offering a concurrent
 * retry.
 */
export function planProjectRowAction(args: {
	status: ProjectImportStatus;
	isImportingAll: boolean;
	findByPathPending: boolean;
	findByPathErrorMessage: string | null;
	findByPathData:
		| Pick<ProjectFindByPathResult, "candidates" | "cloudErrors">
		| undefined;
	serverImported: boolean;
}): ProjectRowActionPlan {
	const {
		status,
		isImportingAll,
		findByPathPending,
		findByPathErrorMessage,
		findByPathData,
		serverImported,
	} = args;
	if (status.kind === "running") return { kind: "running" };
	if (status.kind === "needs-relocate") {
		return {
			kind: "confirm-relocate",
			message: status.message,
			disabled: isImportingAll,
		};
	}
	if (serverImported || status.kind === "imported") {
		return { kind: "imported", label: "Linked" };
	}
	if (status.kind === "error") {
		return isImportingAll
			? { kind: "running", label: "Queued" }
			: { kind: "error", message: status.message, retry: "import" };
	}
	if (findByPathPending) return { kind: "running" };
	if (findByPathErrorMessage !== null) {
		return { kind: "error", message: findByPathErrorMessage, retry: "query" };
	}
	const candidates = findByPathData?.candidates ?? [];
	const cloudErrors = findByPathData?.cloudErrors ?? [];
	if (candidates.length === 0 && cloudErrors.length > 0) {
		const first = cloudErrors[0];
		return {
			kind: "error",
			message: first
				? `Couldn't reach cloud for ${first.url}: ${first.message}`
				: "Couldn't reach cloud",
			retry: "query",
		};
	}
	if (candidates.length > 1) return { kind: "pick", disabled: isImportingAll };
	return {
		kind: "ready",
		label: candidates.length === 1 ? "Link" : "Import",
		disabled: isImportingAll,
	};
}
