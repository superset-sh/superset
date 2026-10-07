import { parseGitRemote } from "@superset/shared/git-remote";
import {
	type PullRequestRef,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";

interface Project {
	projectKey: string;
	repoOwner: string | null;
	repoName: string | null;
	repoUrl?: string | null;
	repoProvider?: string | null;
	repoHost?: string | null;
}

function projectRemote(url: string) {
	if (/[\s\\?#]/.test(url)) return null;
	const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url)?.[1]?.toLowerCase();
	const authority = scheme
		? url.split("://")[1]?.split("/")[0]
		: url.split(":")[0];
	if (authority?.includes("%")) return null;
	if (scheme) {
		if (!["http", "https", "ssh", "git"].includes(scheme)) return null;
		try {
			const parsed = new URL(url);
			if (
				parsed.password ||
				(["http", "https"].includes(scheme) && authority?.includes("@"))
			)
				return null;
		} catch {
			return null;
		}
	}
	return parseGitRemote(url);
}

export function getPullRequestTarget(
	url: string,
	projects: readonly Project[],
): { ref: PullRequestRef; projectId: string | null } | null {
	const ref = pullRequestRefFromUrl(url);
	if (!ref) return null;
	const separator = ref.repoFullName.lastIndexOf("/");
	const owner = ref.repoFullName.slice(0, separator);
	const name = ref.repoFullName.slice(separator + 1);
	const provider = ref.provider ?? "github";
	const host = ref.host ?? "github.com";
	const matches = (actual: string | null | undefined, expected: string) =>
		provider === "github"
			? actual?.toLowerCase() === expected.toLowerCase()
			: actual === expected;
	const project = projects.find((candidate) => {
		if (candidate.repoProvider && candidate.repoProvider !== provider)
			return false;
		if (candidate.repoHost && candidate.repoHost.toLowerCase() !== host)
			return false;
		const remote = candidate.repoUrl ? projectRemote(candidate.repoUrl) : null;
		if (candidate.repoUrl || provider === "gitlab") {
			if (
				!remote ||
				(remote.host !== host &&
					!(
						candidate.repoHost &&
						!/^https?:\/\//i.test(candidate.repoUrl ?? "") &&
						remote.host === new URL(`https://${host}`).hostname
					)) ||
				(provider === "github"
					? remote.provider !== "github"
					: remote.provider === "github") ||
				!matches(remote.owner, owner) ||
				!matches(remote.name, name)
			)
				return false;
		}
		return (
			matches(candidate.repoOwner ?? remote?.owner, owner) &&
			matches(candidate.repoName ?? remote?.name, name)
		);
	});
	return { ref, projectId: project?.projectKey ?? null };
}
