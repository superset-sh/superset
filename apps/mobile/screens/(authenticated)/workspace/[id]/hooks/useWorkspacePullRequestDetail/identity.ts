import { parseGitRemote } from "@superset/shared/git-remote";
import { repositoryIdentityKey } from "@superset/shared/repo-identity";
import { gitlabPullRequestFromUrl } from "@/lib/pull-request-links";

function hasControlCharacter(value: string) {
	return [...value].some(
		(character) =>
			character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
	);
}

export function gitlabPullRequestIdentity(input: {
	expectedUrl?: string;
	repoUrl?: string | null;
	owner: string | null;
	repo: string | null;
	pullNumber: number | null;
}) {
	const parsed =
		input.expectedUrl &&
		!/[?#]/.test(input.expectedUrl) &&
		!input.expectedUrl.endsWith("/")
			? gitlabPullRequestFromUrl(input.expectedUrl)
			: null;
	if (
		!parsed ||
		parsed.owner !== input.owner ||
		parsed.repo !== input.repo ||
		parsed.pullNumber !== input.pullNumber
	)
		return null;
	const remote =
		input.repoUrl &&
		!hasControlCharacter(input.repoUrl) &&
		!input.repoUrl.includes("\\")
			? parseGitRemote(input.repoUrl)
			: null;
	if (!remote || remote.provider === "github") return null;
	const identity = {
		provider: "gitlab" as const,
		host: parsed.host,
		owner: parsed.owner,
		name: parsed.repo,
	};
	if (
		repositoryIdentityKey({ ...remote, provider: "gitlab" }) !==
		repositoryIdentityKey(identity)
	)
		return null;
	return { ...identity, expectedUrl: parsed.expectedUrl };
}
