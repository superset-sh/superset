/**
 * What a cloud workspace sandbox is allowed to reach and what it presents.
 *
 * No credential of ours enters the box. Every outbound credential is a header
 * rule on the sandbox firewall: the agent sends a placeholder, the firewall
 * swaps the header on the way out, and the value lives only here. A rule
 * fires only on the placeholder, so the app's own request with its own key
 * passes untouched. The rules are re-derived and re-applied on every wake and
 * keepalive, so a token that expires (the GitHub installation token lasts an
 * hour) is never stale for longer than one keepalive.
 *
 * What does reach the box is the managed environment: the environment's own
 * variables as the person set them, and the placeholders the CLIs need to be
 * willing to make a request at all, pushed into host-service after boot and
 * held in memory.
 */
import {
	AGENT_ENV_OVERLAY_PREFIX,
	agentCredentialToEnv,
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
				headers: [
					{ key: { regex: `(?i)^${header}$` }, value: { exact: placeholder } },
				],
			},
			transform: [{ headers: { [header]: value } }],
		},
	];
}

/**
 * A model credential is the person's sign-in and nothing else; an
 * environment variable of the same name is the app's and passes through as
 * itself. The placeholder takes the plain name when the environment left it
 * free, and always travels under the agent overlay prefix so the launched
 * agent gets it even when the app's key holds the plain name.
 */
export async function deriveSandboxCredentials(
	inputs: SandboxCredentialInputs,
): Promise<SandboxCredentials> {
	const allow: Record<string, NetworkPolicyRule[]> = {};
	const managedEnv: Record<string, string> = {};

	// The environment's variables reach the box as they are, minus GitHub
	// tokens: git and gh on the box speak through the installation rule.
	const githubKeys = new Set(["GH_TOKEN", "GITHUB_TOKEN"]);
	for (const [key, value] of Object.entries(inputs.environmentEnv)) {
		if (!githubKeys.has(key)) managedEnv[key] = value;
	}
	// git reads these over any user.name in a config file, so a commit on the
	// box is the person's without writing one; set after the environment's
	// variables because authorship belongs to the person, not the environment.
	managedEnv.GIT_AUTHOR_NAME = inputs.gitAuthor.name;
	managedEnv.GIT_AUTHOR_EMAIL = inputs.gitAuthor.email;
	managedEnv.GIT_COMMITTER_NAME = inputs.gitAuthor.name;
	managedEnv.GIT_COMMITTER_EMAIL = inputs.gitAuthor.email;

	const signIn = inputs.userAgentEnv;
	const agentEnv = (key: string, value: string) => {
		if (!(key in inputs.environmentEnv)) managedEnv[key] = value;
		managedEnv[`${AGENT_ENV_OVERLAY_PREFIX}${key}`] = value;
	};

	// Anthropic: an OAuth token (a subscription) authenticates with a bearer,
	// an API key with x-api-key. The CLI decides which header it sends from
	// which placeholder variable is set, so exactly one is set.
	if (signIn.CLAUDE_CODE_OAUTH_TOKEN) {
		allow["api.anthropic.com"] = swap(
			"authorization",
			`Bearer ${SANDBOX_CREDENTIAL_PLACEHOLDER}`,
			`Bearer ${signIn.CLAUDE_CODE_OAUTH_TOKEN}`,
		);
		agentEnv("CLAUDE_CODE_OAUTH_TOKEN", SANDBOX_CREDENTIAL_PLACEHOLDER);
	} else if (signIn.ANTHROPIC_API_KEY) {
		allow["api.anthropic.com"] = swap(
			"x-api-key",
			SANDBOX_CREDENTIAL_PLACEHOLDER,
			signIn.ANTHROPIC_API_KEY,
		);
		agentEnv("ANTHROPIC_API_KEY", SANDBOX_CREDENTIAL_PLACEHOLDER);
	}
	if (signIn.ANTHROPIC_BASE_URL) {
		agentEnv("ANTHROPIC_BASE_URL", signIn.ANTHROPIC_BASE_URL);
	}

	if (signIn.OPENAI_API_KEY) {
		allow["api.openai.com"] = swap(
			"authorization",
			`Bearer ${SANDBOX_CREDENTIAL_PLACEHOLDER}`,
			`Bearer ${signIn.OPENAI_API_KEY}`,
		);
		agentEnv("OPENAI_API_KEY", SANDBOX_CREDENTIAL_PLACEHOLDER);
	}
	if (signIn.OPENAI_BASE_URL) {
		agentEnv("OPENAI_BASE_URL", signIn.OPENAI_BASE_URL);
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
