/**
 * What a cloud workspace sandbox is allowed to reach and what it presents.
 *
 * No credential enters the box. Every outbound credential is a header rule
 * on the sandbox firewall: the agent sends a placeholder, the firewall swaps
 * the header on the way out, and the value lives only here. The rules are
 * re-derived and re-applied on every wake and keepalive, so a token that
 * expires (the GitHub installation token lasts an hour) is never stale for
 * longer than one keepalive.
 *
 * What does reach the box is the managed environment: the environment's own
 * variables and the placeholders the CLIs need to be willing to make a
 * request at all, pushed into host-service after boot and held in memory.
 */
import { agentCredentialToEnv } from "@superset/shared/agent-credentials";
import { SANDBOX_CREDENTIAL_PLACEHOLDER } from "@superset/shared/constants";
import type { NetworkPolicy } from "@vercel/sandbox";
import { env } from "../../env";

export interface SandboxCredentialInputs {
	/** The environment's variables, as the person configured them. */
	environmentEnv: Record<string, string>;
	/** The workspace creator's own agent sign-ins, already decrypted. */
	userAgentEnv: Record<string, string>;
	/**
	 * The GitHub token the box's git and gh requests carry: the workspace
	 * creator's own user token when they have connected GitHub, else the App
	 * installation's, else none.
	 */
	githubToken: string | null;
	/** Who commits made on the box are by. */
	gitAuthor: GitAuthor;
}

export interface GitAuthor {
	name: string;
	email: string;
}

/**
 * A connected GitHub account commits under its no-reply address, which links
 * the commit to the profile and passes GitHub's "block pushes that expose my
 * email" setting; without one, the Superset account's name and email.
 */
export function gitAuthorFor(args: {
	github: { id: string; login: string; name: string | null } | null;
	user: { name: string; email: string };
}): GitAuthor {
	if (args.github) {
		return {
			name: args.github.name || args.github.login,
			email: `${args.github.id}+${args.github.login}@users.noreply.github.com`,
		};
	}
	return { name: args.user.name, email: args.user.email };
}

export interface SandboxCredentials {
	networkPolicy: NetworkPolicy;
	managedEnv: Record<string, string>;
}

type HeaderRule = { transform: Array<{ headers: Record<string, string> }> };

function rule(headers: Record<string, string>): HeaderRule[] {
	return [{ transform: [{ headers }] }];
}

/**
 * The precedence for a model provider: the person's own sign-in beats the
 * environment's variable, which beats the organization's key. Whichever
 * wins becomes the header rule; the box only ever sees the placeholder.
 */
export function deriveSandboxCredentials(
	inputs: SandboxCredentialInputs,
): SandboxCredentials {
	const allow: Record<string, HeaderRule[]> = {};
	const managedEnv: Record<string, string> = {};

	// The environment's variables reach the box as they are, minus the ones
	// that are credentials for a brokered provider, which become rules.
	const brokeredKeys = new Set([
		"ANTHROPIC_API_KEY",
		"CLAUDE_CODE_OAUTH_TOKEN",
		"OPENAI_API_KEY",
		"GH_TOKEN",
		"GITHUB_TOKEN",
	]);
	for (const [key, value] of Object.entries(inputs.environmentEnv)) {
		if (!brokeredKeys.has(key)) managedEnv[key] = value;
	}
	// git reads these over any user.name in a config file, so a commit on the
	// box is the person's without writing one; set after the environment's
	// variables because authorship belongs to the person, not the environment.
	managedEnv.GIT_AUTHOR_NAME = inputs.gitAuthor.name;
	managedEnv.GIT_AUTHOR_EMAIL = inputs.gitAuthor.email;
	managedEnv.GIT_COMMITTER_NAME = inputs.gitAuthor.name;
	managedEnv.GIT_COMMITTER_EMAIL = inputs.gitAuthor.email;

	const pick = (key: string): string | undefined =>
		inputs.userAgentEnv[key] || inputs.environmentEnv[key] || undefined;

	// Anthropic: an OAuth token (a subscription) authenticates with a bearer,
	// an API key with x-api-key. The CLI decides which header it sends from
	// which placeholder variable is set, so exactly one is set.
	const oauth = pick("CLAUDE_CODE_OAUTH_TOKEN");
	const anthropicKey = pick("ANTHROPIC_API_KEY") ?? env.ANTHROPIC_API_KEY;
	if (oauth) {
		allow["api.anthropic.com"] = rule({ Authorization: `Bearer ${oauth}` });
		managedEnv.CLAUDE_CODE_OAUTH_TOKEN = SANDBOX_CREDENTIAL_PLACEHOLDER;
	} else if (anthropicKey) {
		allow["api.anthropic.com"] = rule({ "x-api-key": anthropicKey });
		managedEnv.ANTHROPIC_API_KEY = SANDBOX_CREDENTIAL_PLACEHOLDER;
	}
	const anthropicBase = pick("ANTHROPIC_BASE_URL");
	if (anthropicBase) managedEnv.ANTHROPIC_BASE_URL = anthropicBase;

	const openaiKey = pick("OPENAI_API_KEY") ?? env.OPENAI_API_KEY;
	if (openaiKey) {
		allow["api.openai.com"] = rule({ Authorization: `Bearer ${openaiKey}` });
		managedEnv.OPENAI_API_KEY = SANDBOX_CREDENTIAL_PLACEHOLDER;
	}
	const openaiBase = pick("OPENAI_BASE_URL");
	if (openaiBase) managedEnv.OPENAI_BASE_URL = openaiBase;

	// GitHub: git speaks Basic with the token as the password, gh and the
	// REST API speak bearer. Both are the installation token, scoped to the
	// workspace's repository and re-minted before it expires.
	if (inputs.githubToken) {
		const basic = Buffer.from(`x-access-token:${inputs.githubToken}`).toString(
			"base64",
		);
		allow["github.com"] = rule({ Authorization: `Basic ${basic}` });
		allow["api.github.com"] = rule({
			Authorization: `Bearer ${inputs.githubToken}`,
		});
		allow["uploads.github.com"] = rule({
			Authorization: `Bearer ${inputs.githubToken}`,
		});
		// gh refuses to call without a token in hand; the value never matters.
		managedEnv.GH_TOKEN = SANDBOX_CREDENTIAL_PLACEHOLDER;
	}

	// The catch-all keeps the rest of the internet reachable; without it a
	// custom policy denies everything it does not list.
	const networkPolicy: NetworkPolicy =
		Object.keys(allow).length === 0
			? "allow-all"
			: { allow: { ...allow, "*": [] } };
	return { networkPolicy, managedEnv };
}

/** Re-exported so callers build the user's env the one way the sign-in code does. */
export { agentCredentialToEnv };
