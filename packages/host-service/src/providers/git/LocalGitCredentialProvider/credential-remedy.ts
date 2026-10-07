import type { CredentialProblem } from "../../../runtime/git/types";

/** Where LocalGitCredentialProvider found a token, in lookup order. */
export type TokenSource =
	| "env:GITHUB_TOKEN"
	| "env:GH_TOKEN"
	| "git-credential"
	| "gh-cli"
	| "glab-cli"
	| "env:GITLAB_TOKEN"
	| "env:GITLAB_ACCESS_TOKEN"
	| "env:OAUTH_TOKEN";

/** What GitHub rejected, and the one action that replaces it. */
const REJECTED: Record<
	Exclude<TokenSource, "glab-cli" | `env:GITLAB${string}` | "env:OAUTH_TOKEN">,
	{ credential: string; fix: string }
> = {
	"env:GITHUB_TOKEN": {
		credential: "this machine's GITHUB_TOKEN",
		fix: "Update or unset it, then restart Superset.",
	},
	"env:GH_TOKEN": {
		credential: "this machine's GH_TOKEN",
		fix: "Update or unset it, then restart Superset.",
	},
	"git-credential": {
		// `git credential fill` wins over the gh CLI, so `gh auth login` can
		// leave the rejected entry selected.
		credential: "this machine's saved github.com credential",
		fix: "Remove or update that credential, then restart Superset.",
	},
	"gh-cli": {
		// The resolved token is cached for five minutes, so an immediate
		// retry would reuse the rejected one.
		credential: "this machine's gh CLI login",
		fix: "Run `gh auth login`, then restart Superset.",
	},
};

/**
 * Name the credential and the fix in one line. The parenthetical matters:
 * these are the machine's own credentials, and users otherwise reconnect
 * the org's GitHub App integration forever (#6832).
 */
export function localCredentialRemedy(
	problem: CredentialProblem,
	source: TokenSource | null,
	host = "github.com",
): string {
	if (host !== "github.com")
		return otherHostCredentialRemedy(host, problem, source);
	if (problem === "missing") {
		return "No GitHub login on this machine (the Superset integration doesn't cover this). Run `gh auth login`.";
	}
	const rejected =
		source && source in REJECTED
			? REJECTED[source as keyof typeof REJECTED]
			: null;
	return rejected
		? `GitHub rejected ${rejected.credential} (not the Superset integration). ${rejected.fix}`
		: "GitHub rejected this machine's GitHub login (not the Superset integration). Run `gh auth login`.";
}

function otherHostCredentialRemedy(
	host: string,
	problem: CredentialProblem,
	source: TokenSource | null,
): string {
	const login = `Run \`glab auth login --hostname ${host}\` for GitLab, or configure Git's credential helper for ${host}.`;
	if (problem === "missing")
		return `No login for ${host} on this machine. ${login}`;
	if (source?.startsWith("env:"))
		return `${host} rejected this machine's ${source.slice(4)}. Update or unset it, then restart Superset.`;
	if (source === "git-credential")
		return `${host} rejected this machine's saved ${host} credential. Remove or update that credential, then restart Superset.`;
	if (source === "glab-cli")
		return `${host} rejected this machine's glab CLI login. Run \`glab auth login --hostname ${host}\`, then restart Superset.`;
	return `${host} rejected this machine's login. ${login}`;
}
