import type { WorkspaceInitStep } from "shared/types/workspace-init";

export interface HostServiceProgressStep {
	id: string;
	label: string;
	status: "pending" | "active" | "done";
}

/**
 * Maps the v2 host-service `workspaceCreation.getProgress` step list onto v1's
 * `WorkspaceInitStep` enum so we can reuse the v1 KeypadLoader + StepProgress
 * components on the v2 pending page.
 *
 * Host-service emits five steps, but v2's meaningful user-facing work is in
 * the latter three: worktree creation, registration, and finalizing/opening.
 * Keep the first two keypad beats as quick preflight/fetch lead-ins, then map
 * those latter three states onto the final three keypad keys.
 *
 * Navigation does not wait for this display mapping; it is purely
 * presentational.
 */
export function mapProgressToInitStep(
	steps: HostServiceProgressStep[] | undefined,
): WorkspaceInitStep {
	if (!steps || steps.length === 0) return "pending";

	if (steps.every((s) => s.status === "done")) return "ready";

	const active = steps.find((s) => s.status === "active");
	if (active) {
		switch (active.id) {
			case "ensuring_repo":
				return "syncing";
			case "fetching_remote":
				return "fetching";
			case "creating_worktree":
				return "creating_worktree";
			case "registering":
				return "copying_config";
			case "finalizing":
				return "finalizing";
		}
	}

	let lastDoneIdx = -1;
	for (let i = 0; i < steps.length; i++) {
		if (steps[i].status === "done") lastDoneIdx = i;
	}
	if (lastDoneIdx === -1) return "pending";
	const lastDoneId = steps[lastDoneIdx].id;
	if (lastDoneId === "ensuring_repo") return "verifying";
	if (lastDoneId === "fetching_remote") return "creating_worktree";
	if (lastDoneId === "creating_worktree") return "copying_config";
	if (lastDoneId === "registering") return "finalizing";
	if (lastDoneId === "finalizing") return "ready";
	return "pending";
}
