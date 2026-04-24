export interface ProgressStep {
	id: string;
	label: string;
	status: "pending" | "active" | "done";
}

interface ProgressState {
	steps: ProgressStep[];
	updatedAt: number;
}

const STEP_DEFINITIONS = [
	{ id: "ensuring_repo", label: "Ensuring local repository" },
	{ id: "creating_worktree", label: "Creating worktree" },
	{ id: "registering", label: "Registering workspace" },
] as const;

const createProgress = new Map<string, ProgressState>();

export function setProgress(pendingId: string, activeStepId: string): void {
	if (!STEP_DEFINITIONS.some((def) => def.id === activeStepId)) {
		console.warn(
			`[workspaceCreation.progress] unknown activeStepId "${activeStepId}" for pendingId "${pendingId}"`,
		);
		return;
	}
	let reachedActive = false;
	const steps: ProgressStep[] = STEP_DEFINITIONS.map((def) => {
		if (def.id === activeStepId) {
			reachedActive = true;
			return { id: def.id, label: def.label, status: "active" };
		}
		if (!reachedActive) {
			return { id: def.id, label: def.label, status: "done" };
		}
		return { id: def.id, label: def.label, status: "pending" };
	});
	createProgress.set(pendingId, { steps, updatedAt: Date.now() });
}

export function getProgress(pendingId: string): ProgressStep[] | null {
	return createProgress.get(pendingId)?.steps ?? null;
}

export function clearProgress(pendingId: string): void {
	createProgress.delete(pendingId);
}

export function sweepStaleProgress(): void {
	const cutoff = Date.now() - 5 * 60 * 1000;
	for (const [id, entry] of createProgress) {
		if (entry.updatedAt < cutoff) createProgress.delete(id);
	}
}
