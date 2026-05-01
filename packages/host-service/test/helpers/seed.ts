import { randomUUID } from "node:crypto";
import {
	projects,
	pullRequests,
	terminalSessions,
	workspaces,
} from "../../src/db/schema";
import type { TestHost } from "./createTestHost";

/**
 * Focused DB-seed helpers. Tests express *what* they need ("a project at
 * this path") rather than the drizzle insert shape, so future schema
 * changes (renames, new columns) only touch this file.
 *
 * Each helper:
 *   - generates a UUID id when none is supplied (so tests can ignore ids
 *     they don't care about)
 *   - returns the fully-populated row's identity fields
 *   - is synchronous against the bun:sqlite-backed db (matches drizzle
 *     `.run()` semantics)
 */

export interface SeedProjectOptions {
	id?: string;
	repoPath: string;
	repoOwner?: string;
	repoName?: string;
	repoUrl?: string;
	repoProvider?: string;
	remoteName?: string;
}

export function seedProject(
	host: TestHost,
	options: SeedProjectOptions,
): { id: string } {
	const id = options.id ?? randomUUID();
	host.db
		.insert(projects)
		.values({
			id,
			repoPath: options.repoPath,
			repoOwner: options.repoOwner,
			repoName: options.repoName,
			repoUrl: options.repoUrl,
			repoProvider: options.repoProvider,
			remoteName: options.remoteName,
		})
		.run();
	return { id };
}

export interface SeedWorkspaceOptions {
	id?: string;
	projectId: string;
	worktreePath: string;
	branch: string;
	headSha?: string | null;
	upstreamOwner?: string | null;
	upstreamRepo?: string | null;
	upstreamBranch?: string | null;
	pullRequestId?: string | null;
}

export function seedWorkspace(
	host: TestHost,
	options: SeedWorkspaceOptions,
): { id: string } {
	const id = options.id ?? randomUUID();
	host.db
		.insert(workspaces)
		.values({
			id,
			projectId: options.projectId,
			worktreePath: options.worktreePath,
			branch: options.branch,
			headSha: options.headSha,
			upstreamOwner: options.upstreamOwner,
			upstreamRepo: options.upstreamRepo,
			upstreamBranch: options.upstreamBranch,
			pullRequestId: options.pullRequestId,
		})
		.run();
	return { id };
}

export interface SeedTerminalSessionOptions {
	id?: string;
	originWorkspaceId: string | null;
	status?: string;
}

export function seedTerminalSession(
	host: TestHost,
	options: SeedTerminalSessionOptions,
): { id: string } {
	const id = options.id ?? randomUUID();
	host.db
		.insert(terminalSessions)
		.values({
			id,
			originWorkspaceId: options.originWorkspaceId,
			status: options.status ?? "active",
		})
		.run();
	return { id };
}

export interface SeedPullRequestOptions {
	id?: string;
	projectId: string;
	repoOwner?: string;
	repoName?: string;
	repoProvider?: string;
	prNumber: number;
	url?: string;
	title?: string;
	state?: string;
	headBranch: string;
	headSha?: string;
	checksStatus?: string;
	checksJson?: string;
	reviewDecision?: string | null;
	error?: string | null;
}

export function seedPullRequest(
	host: TestHost,
	options: SeedPullRequestOptions,
): { id: string } {
	const id = options.id ?? randomUUID();
	host.db
		.insert(pullRequests)
		.values({
			id,
			projectId: options.projectId,
			repoProvider: options.repoProvider ?? "github",
			repoOwner: options.repoOwner ?? "octocat",
			repoName: options.repoName ?? "hello",
			prNumber: options.prNumber,
			url:
				options.url ??
				`https://github.com/${options.repoOwner ?? "octocat"}/${options.repoName ?? "hello"}/pull/${options.prNumber}`,
			title: options.title ?? `PR #${options.prNumber}`,
			state: options.state ?? "open",
			headBranch: options.headBranch,
			headSha: options.headSha ?? "deadbeef",
			checksStatus: options.checksStatus ?? "none",
			checksJson: options.checksJson ?? "[]",
			reviewDecision: options.reviewDecision,
			error: options.error,
		})
		.run();
	return { id };
}
