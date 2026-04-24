// ── In-memory create progress (polled by renderer) ──────────────────

export interface ProgressStep {
	id: string;
	label: string;
	status: "pending" | "active" | "done";
}

export interface ProgressState {
	steps: ProgressStep[];
	updatedAt: number;
}

export const STEP_DEFINITIONS = [
	{ id: "ensuring_repo", label: "Ensuring local repository" },
	{ id: "creating_worktree", label: "Creating worktree" },
	{ id: "registering", label: "Registering workspace" },
] as const;

export const createProgress = new Map<string, ProgressState>();

export function setProgress(pendingId: string, activeStepId: string): void {
	let reachedActive = false;
	const steps: ProgressStep[] = STEP_DEFINITIONS.map((def) => {
		if (def.id === activeStepId) {
			reachedActive = true;
			return { id: def.id, label: def.label, status: "active" as const };
		}
		if (!reachedActive) {
			return { id: def.id, label: def.label, status: "done" as const };
		}
		return { id: def.id, label: def.label, status: "pending" as const };
	});
	createProgress.set(pendingId, { steps, updatedAt: Date.now() });
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
