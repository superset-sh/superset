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
 * variables minus any provider credential, which a cloud workspace ignores,
 * and the placeholders the CLIs need to be willing to make a request at all,
 * pushed into host-service after boot and held in memory.
 */
import {
	agentCredentialToEnv,
	CLOUD_WORKSPACE_IGNORED_ENV_NAMES,
} from "@superset/shared/agent-credentials";
import { SANDBOX_CREDENTIAL_PLACEHOLDER } from "@superset/shared/constants";
import {
	SANDBOX_API_CREDENTIAL_HEADER,
	sandboxApiCredential,
} from "@superset/shared/sandbox-gate";
import type { NetworkPolicy, NetworkPolicyRule } from "@vercel/sandbox";
import { env } from "../../env";

export interface SandboxCredentialInputs {
	/** Which workspace the box is, for the credential it presents to the API. */
	workspaceId: string;
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
 * The API's own hostname, as the firewall needs it: no scheme, no path. Null
 * where the API URL is not configured, which is a test and not a deployment.
 */
function apiHost(): string | null {
	try {
		return new URL(env.NEXT_PUBLIC_API_URL).host;
	} catch {
		return null;
	}
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

function rule(headers: Record<string, string>): NetworkPolicyRule[] {
	return [{ transform: [{ headers }] }];
}

/** Sets `header` only on a request that presents the placeholder in it. */
function swap(
	header: string,
	placeholder: string,
	value: string,
): NetworkPolicyRule[] {
	return [
		{
			match: {
				headers: [{ key: { exact: header }, value: { exact: placeholder } }],
			},
			transform: [{ headers: { [header]: value } }],
		},
	];
}

/** A model credential is the person's sign-in and nothing else. */
export async function deriveSandboxCredentials(
	inputs: SandboxCredentialInputs,
): Promise<SandboxCredentials> {
	const allow: Record<string, NetworkPolicyRule[]> = {};
	const managedEnv: Record<string, string> = {};

	// GitHub tokens are dropped too: git and gh on the box speak through the
	// installation rule.
	const ignored = new Set<string>([
		...CLOUD_WORKSPACE_IGNORED_ENV_NAMES,
		"GH_TOKEN",
		"GITHUB_TOKEN",
	]);
	for (const [key, value] of Object.entries(inputs.environmentEnv)) {
		if (!ignored.has(key)) managedEnv[key] = value;
	}
	// git reads these over any user.name in a config file, so a commit on the
	// box is the person's without writing one; set after the environment's
	// variables because authorship belongs to the person, not the environment.
	managedEnv.GIT_AUTHOR_NAME = inputs.gitAuthor.name;
	managedEnv.GIT_AUTHOR_EMAIL = inputs.gitAuthor.email;
	managedEnv.GIT_COMMITTER_NAME = inputs.gitAuthor.name;
	managedEnv.GIT_COMMITTER_EMAIL = inputs.gitAuthor.email;

	const signIn = inputs.userAgentEnv;
	const hostOf = (baseUrl: string | undefined, fallback: string): string => {
		try {
			return baseUrl ? new URL(baseUrl).hostname : fallback;
		} catch {
			return fallback;
		}
	};

	// Anthropic: an OAuth token (a subscription) and a gateway key both
	// authenticate with a bearer, an API key with x-api-key. The CLI decides
	// which header it sends from which placeholder variable is set, so exactly
	// one is set.
	const anthropicHost = hostOf(signIn.ANTHROPIC_BASE_URL, "api.anthropic.com");
	const anthropicBearer =
		signIn.CLAUDE_CODE_OAUTH_TOKEN || signIn.ANTHROPIC_AUTH_TOKEN;
	if (anthropicBearer) {
		allow[anthropicHost] = swap(
			"authorization",
			`Bearer ${SANDBOX_CREDENTIAL_PLACEHOLDER}`,
			`Bearer ${anthropicBearer}`,
		);
		if (signIn.CLAUDE_CODE_OAUTH_TOKEN) {
			managedEnv.CLAUDE_CODE_OAUTH_TOKEN = SANDBOX_CREDENTIAL_PLACEHOLDER;
		} else {
			managedEnv.ANTHROPIC_AUTH_TOKEN = SANDBOX_CREDENTIAL_PLACEHOLDER;
		}
	} else if (signIn.ANTHROPIC_API_KEY) {
		allow[anthropicHost] = swap(
			"x-api-key",
			SANDBOX_CREDENTIAL_PLACEHOLDER,
			signIn.ANTHROPIC_API_KEY,
		);
		managedEnv.ANTHROPIC_API_KEY = SANDBOX_CREDENTIAL_PLACEHOLDER;
	}
	if (signIn.ANTHROPIC_BASE_URL) {
		managedEnv.ANTHROPIC_BASE_URL = signIn.ANTHROPIC_BASE_URL;
	}

	if (signIn.OPENAI_API_KEY) {
		allow[hostOf(signIn.OPENAI_BASE_URL, "api.openai.com")] = swap(
			"authorization",
			`Bearer ${SANDBOX_CREDENTIAL_PLACEHOLDER}`,
			`Bearer ${signIn.OPENAI_API_KEY}`,
		);
		managedEnv.OPENAI_API_KEY = SANDBOX_CREDENTIAL_PLACEHOLDER;
	}
	if (signIn.OPENAI_BASE_URL) {
		managedEnv.OPENAI_BASE_URL = signIn.OPENAI_BASE_URL;
	}

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

	// The box's own hands: `superset` on its PATH speaks to the API as the
	// workspace, and the credential is added here rather than given to the box.
	// What it may do is narrowed on the API side, in sandboxCredentialProcedures.
	const api = apiHost();
	if (api) {
		allow[api] = rule({
			[SANDBOX_API_CREDENTIAL_HEADER]: `${inputs.workspaceId}.${await sandboxApiCredential(
				env.SANDBOX_GATE_SECRET,
				inputs.workspaceId,
			)}`,
		});
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
