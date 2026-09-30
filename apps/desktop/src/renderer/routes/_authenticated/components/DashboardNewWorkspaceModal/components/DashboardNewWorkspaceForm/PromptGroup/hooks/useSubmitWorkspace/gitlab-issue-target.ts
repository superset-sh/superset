import type { LinkedIssue } from "renderer/stores/new-workspace-draft";

export type GitLabIssueTargetMismatch = "project" | "host" | "repository";

export function getGitLabIssueTargetMismatch(
	linkedIssues: LinkedIssue[],
	projectId: string | null,
	hostId: string | null,
	localMachineId: string | null,
): GitLabIssueTargetMismatch | null {
	const gitLabIssues = linkedIssues.filter(
		(issue) => issue.source === "gitlab",
	);
	if (gitLabIssues.length === 0) return null;
	if (
		!projectId ||
		gitLabIssues.some(
			(issue) => !issue.projectId || issue.projectId !== projectId,
		)
	) {
		return "project";
	}
	if (
		gitLabIssues.some(
			(issue) =>
				!issue.url ||
				!Number.isInteger(issue.number) ||
				(issue.number ?? 0) <= 0,
		)
	) {
		return "repository";
	}
	if (
		!hostId ||
		gitLabIssues.some((issue) => (issue.hostId ?? localMachineId) !== hostId)
	) {
		return "host";
	}
	const firstIssue = gitLabIssues[0];
	if (
		!firstIssue?.instance ||
		!firstIssue.repoPath ||
		gitLabIssues.some(
			(issue) =>
				issue.instance !== firstIssue.instance ||
				issue.repoPath !== firstIssue.repoPath,
		)
	) {
		return "repository";
	}
	return null;
}
