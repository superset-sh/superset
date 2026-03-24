import { execGitWithShellPath } from "../git-client";
import { readCachedRepoContext } from "./cache";
import type { GitLabRepoContext } from "./types";

/**
 * Normalizes a GitLab remote URL to a canonical URL.
 * SSH URLs are converted to HTTPS. HTTP/HTTPS URLs preserve their original protocol.
 */
export function normalizeGitLabUrl(remoteUrl: string): string | null {
	const trimmed = remoteUrl.trim();

	// SSH: git@gitlab.com:group/project.git
	const sshMatch = trimmed.match(/^git@(?<host>[^:]+):(?<path>.+?)(?:\.git)?$/);
	if (sshMatch?.groups) {
		return `https://${sshMatch.groups.host}/${sshMatch.groups.path}`;
	}

	// SSH with protocol: ssh://git@gitlab.com/group/project.git
	const sshProtoMatch = trimmed.match(
		/^ssh:\/\/git@(?<host>[^/]+)\/(?<path>.+?)(?:\.git)?$/,
	);
	if (sshProtoMatch?.groups) {
		return `https://${sshProtoMatch.groups.host}/${sshProtoMatch.groups.path}`;
	}

	// HTTPS/HTTP: https://gitlab.com/group/project.git or http://gitlab.example.com/group/project.git
	const httpsMatch = trimmed.match(
		/^(?<protocol>https?:\/\/)(?<host>[^/]+)\/(?<path>.+?)(?:\.git)?\/?$/,
	);
	if (httpsMatch?.groups) {
		return `${httpsMatch.groups.protocol}${httpsMatch.groups.host}/${httpsMatch.groups.path}`;
	}

	return null;
}

/**
 * Extracts the project path from a normalized GitLab URL.
 * Returns the path URL-encoded for use in GitLab API calls.
 */
export function extractProjectPath(normalizedUrl: string): string | null {
	try {
		const path = new URL(normalizedUrl).pathname.slice(1);
		return path ? encodeURIComponent(path) : null;
	} catch {
		return null;
	}
}

/**
 * Extracts the raw (non-encoded) project path from a normalized GitLab URL.
 */
export function extractRawProjectPath(normalizedUrl: string): string | null {
	try {
		const path = new URL(normalizedUrl).pathname.slice(1);
		return path || null;
	} catch {
		return null;
	}
}

async function getOriginUrl(worktreePath: string): Promise<string | null> {
	try {
		const { stdout } = await execGitWithShellPath(
			["remote", "get-url", "origin"],
			{ cwd: worktreePath },
		);
		return normalizeGitLabUrl(stdout.trim());
	} catch (error) {
		console.warn(
			"[GitLab] getOriginUrl failed:",
			error instanceof Error ? error.message : String(error),
		);
		return null;
	}
}

async function getUpstreamRemoteUrl(
	worktreePath: string,
): Promise<string | null> {
	try {
		const { stdout } = await execGitWithShellPath(
			["remote", "get-url", "upstream"],
			{ cwd: worktreePath },
		);
		return normalizeGitLabUrl(stdout.trim());
	} catch (error) {
		console.warn(
			"[GitLab] getUpstreamRemoteUrl failed:",
			error instanceof Error ? error.message : String(error),
		);
		return null;
	}
}

async function refreshRepoContext(
	worktreePath: string,
): Promise<GitLabRepoContext | null> {
	try {
		const originUrl = await getOriginUrl(worktreePath);
		if (!originUrl) {
			return null;
		}

		const projectPath = extractProjectPath(originUrl);
		if (!projectPath) {
			return null;
		}

		// Check if there's an upstream remote (fork setup)
		const upstreamUrl = await getUpstreamRemoteUrl(worktreePath);

		// Compare ignoring protocol differences (http vs https)
		const isSameRepo =
			upstreamUrl &&
			upstreamUrl.replace(/^https?:\/\//, "") ===
				originUrl.replace(/^https?:\/\//, "");
		if (upstreamUrl && !isSameRepo) {
			const upstreamProjectPath = extractProjectPath(upstreamUrl);
			return {
				repoUrl: originUrl,
				upstreamUrl,
				isFork: true,
				projectPath: upstreamProjectPath ?? projectPath,
			};
		}

		return {
			repoUrl: originUrl,
			upstreamUrl: originUrl,
			isFork: false,
			projectPath,
		};
	} catch (error) {
		console.warn("[GitLab] Failed to refresh repo context:", error);
		return null;
	}
}

export async function getGitLabRepoContext(
	worktreePath: string,
	options?: { forceFresh?: boolean },
): Promise<GitLabRepoContext | null> {
	return readCachedRepoContext(
		worktreePath,
		() => refreshRepoContext(worktreePath),
		{ forceFresh: options?.forceFresh },
	);
}
