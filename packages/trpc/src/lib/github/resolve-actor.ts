/**
 * Who acts on GitHub for an organization: the member's own connected account,
 * or the App installation. The one place that decides, so a sandbox push, a
 * PR opened from chat, and a review comment all answer the question the same
 * way — nothing else may pick a token.
 *
 * Two connections can act (see organization_settings.github_actor_policy):
 *   bot          the App, always
 *   user_or_bot  the member when connected, otherwise the App
 *   user_only    the member; refused when not connected
 * Callers with no member — automations, scheduled runs — resolve to the App
 * under every policy, the way Devin's "service users fall back" does.
 *
 * Commit authorship is deliberately not decided here: the author is always
 * the member, set with `git config` where the commit is made, and no token is
 * involved. This resolver is only for the actions that carry one.
 */
import { db } from "@superset/db/client";
import {
	type GithubActorPolicy,
	githubInstallations,
	githubRepositories,
	organizationSettings,
} from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import {
	findGithubUserConnection,
	getGithubUserAccessToken,
	githubConfigOf,
} from "../../router/integration/github/user-connection";
import { installationOctokit } from "../blaxel/clone-token";

export type GitHubActor =
	| { kind: "user"; token: string; login: string }
	| { kind: "app"; token: string };

export class GitHubActorRefusedError extends Error {
	constructor(
		readonly reason: "user_not_connected" | "no_installation",
		message: string,
	) {
		super(message);
		this.name = "GitHubActorRefusedError";
	}
}

/**
 * The policy table on its own, so it can be read without a database. Returns
 * which connection to use, or "refuse".
 */
export function chooseGitHubActor(args: {
	policy: GithubActorPolicy;
	hasUser: boolean;
	userConnected: boolean;
}): "user" | "app" | "refuse" {
	const { policy, hasUser, userConnected } = args;
	if (!hasUser || policy === "bot") return "app";
	if (userConnected) return "user";
	return policy === "user_only" ? "refuse" : "app";
}

export async function organizationGithubActorPolicy(
	organizationId: string,
): Promise<GithubActorPolicy> {
	const settings = await db.query.organizationSettings.findFirst({
		where: eq(organizationSettings.organizationId, organizationId),
		columns: { githubActorPolicy: true },
	});
	// No row yet means the default; the row is created on first write.
	return settings?.githubActorPolicy ?? "user_or_bot";
}

export async function resolveGitHubActor(input: {
	organizationId: string;
	/** Null for automations and anything else with no member behind it. */
	userId: string | null;
	repo: { owner: string; name: string };
}): Promise<GitHubActor> {
	const policy = await organizationGithubActorPolicy(input.organizationId);
	const connection = input.userId
		? await findGithubUserConnection(input.organizationId, input.userId)
		: null;

	const choice = chooseGitHubActor({
		policy,
		hasUser: input.userId !== null,
		userConnected: connection !== null,
	});

	if (choice === "refuse") {
		throw new GitHubActorRefusedError(
			"user_not_connected",
			"This organization requires your own GitHub account for pushes and pull requests. Connect it in Settings → Integrations → GitHub.",
		);
	}

	if (choice === "user" && connection) {
		const token = await getGithubUserAccessToken(connection.id);
		const login = githubConfigOf(connection.config)?.login ?? "";
		if (token) return { kind: "user", token, login };
		// The grant died between the lookup and now (revoked on GitHub, refresh
		// token spent). user_only means exactly that; user_or_bot degrades.
		if (policy === "user_only") {
			throw new GitHubActorRefusedError(
				"user_not_connected",
				"Your GitHub connection has expired. Reconnect it in Settings → Integrations → GitHub.",
			);
		}
	}

	return { kind: "app", token: await appInstallationToken(input.repo) };
}

/**
 * Narrowed to this repo and to pushing it. Unnarrowed, an installation token
 * covers every repo the App is installed on with every permission it holds — a
 * sandbox for project A could push project B. A leak must be one repo for one
 * hour, not an installation.
 */
async function appInstallationToken(repo: {
	owner: string;
	name: string;
}): Promise<string> {
	const row = await db.query.githubRepositories.findFirst({
		where: and(
			eq(githubRepositories.owner, repo.owner),
			eq(githubRepositories.name, repo.name),
		),
	});
	const installation = row
		? await db.query.githubInstallations.findFirst({
				where: eq(githubInstallations.id, row.installationId),
			})
		: null;
	if (!installation) {
		throw new GitHubActorRefusedError(
			"no_installation",
			`The Superset GitHub App is not installed on ${repo.owner}/${repo.name}.`,
		);
	}
	const octokit = await installationOctokit(installation.installationId);
	const { token } = (await octokit.auth({
		type: "installation",
		repositoryNames: [repo.name],
		permissions: { contents: "write", pull_requests: "write" },
	})) as { token: string };
	return token;
}
