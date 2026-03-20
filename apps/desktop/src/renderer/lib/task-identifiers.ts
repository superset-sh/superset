import { getTaskDisplayId } from "@superset/shared/task-display";
import { sanitizeSegment } from "shared/utils/branch";

interface TaskIdentifierLike {
	id: string;
	slug: string;
	externalKey?: string | null;
}

interface TaskBranchLike extends TaskIdentifierLike {
	title: string;
}

export function getTaskIdentifierCandidates(
	task: TaskIdentifierLike,
): string[] {
	const candidates = [getTaskDisplayId(task), task.slug];

	if (task.externalKey) {
		candidates.push(task.id.slice(0, 8));
	}

	const seen = new Set<string>();

	return candidates.filter((candidate) => {
		const normalizedCandidate = candidate.trim();
		if (!normalizedCandidate) {
			return false;
		}

		const key = normalizedCandidate.toLowerCase();
		if (seen.has(key)) {
			return false;
		}

		seen.add(key);
		return true;
	});
}

export function deriveTaskBranchName({
	slug,
	title,
}: {
	slug: string;
	title: string;
}): string {
	const prefix = slug.toLowerCase();
	const titleSegment = sanitizeSegment(title, 40);
	return titleSegment ? `${prefix}-${titleSegment}` : prefix;
}

export function getTaskBranchCandidates(task: TaskBranchLike): string[] {
	const identifierCandidates = getTaskIdentifierCandidates(task);
	const branchCandidates = [
		...identifierCandidates.map((candidate) =>
			deriveTaskBranchName({
				slug: candidate,
				title: task.title,
			}),
		),
		...identifierCandidates.map((candidate) => candidate.toLowerCase()),
	];
	const seen = new Set<string>();

	return branchCandidates.filter((candidate) => {
		const normalizedCandidate = candidate.trim();
		if (!normalizedCandidate) {
			return false;
		}

		const key = normalizedCandidate.toLowerCase();
		if (seen.has(key)) {
			return false;
		}

		seen.add(key);
		return true;
	});
}
