/**
 * Mints a git credential for a sandbox, on demand, for one operation.
 *
 * A sandbox holds no git *credential*. When git inside it needs one,
 * host-service asks here, proving which sandbox it is with a secret it was
 * handed at provision, and the answer is minted fresh, scoped to the
 * workspace's repo, and short-lived — the same shape Coder uses (`GIT_ASKPASS`
 * → agent → control plane).
 *
 * Be precise about what that secret is: a durable capability to mint. It sits
 * in host-service's environment, readable by anything in the sandbox, and it
 * works from anywhere until the workspace is deleted. So the credential's
 * lifetime is bounded, but the *ability to obtain one* is not — a leaked
 * secret is a leaked account-scoped mint until the row leaves `ready`. That is
 * an accepted trade while creation is gated to the team (see
 * docs/cloud-sandbox-considerations.md); the stronger design, injecting the
 * git credential at the egress proxy like the model keys, is what closes it.
 *
 * Whose credential: the GitHub App's installation token, narrowed to the
 * workspace's repo. Whose *identity*: the commit author is the creating user
 * (git config set at boot), so attribution on GitHub is theirs regardless of
 * which token pushed; only the push itself is the App's. Using the user's own
 * OAuth token instead is deliberately not done here — sign-in requests no
 * `repo` scope, so it would need a consent surface, and a user token has no
 * expiry to bound a leak the way an installation token's hour does. That is a
 * separate piece of work and must ship with its consent flow, not before it.
 *
 * Push scope: a credential is refused when the helper reports a push to the
 * repo's default branch from a workspace not created on it. This is an
 * accident guard, not a security boundary — the branch is inferred by the
 * helper from the checkout, git's credential protocol carries no refspec, and
 * `git push origin HEAD:main` sidesteps it entirely. Once a push-capable token
 * is in hand nothing here can revisit the decision. What actually holds a
 * prompt-injected agent off `main` is branch protection on the repo; treat
 * that as a prerequisite for cloud workspaces, not something this replaces.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db, dbWs } from "@superset/db/client";
import {
	cloudWorkspaces,
	githubInstallations,
	githubRepositories,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { installationOctokit } from "../../lib/blaxel/clone-token";
import { repoForProject } from "../../lib/blaxel/repo-for-project";

/**
 * Advertised lifetime of a minted credential. Emitted to git as
 * password_expiry_utc, which git ≥ 2.40 uses to bound how long a *caching*
 * helper may serve a credential — and the sandbox registers no caching helper,
 * so today it governs nothing: every git operation re-brokers, and the
 * credential lives only as long as the git process that asked. That is the
 * actual bound, and it is tighter than any expiry. Kept for when a cache is
 * added; do not read it as "git caches this long", it doesn't.
 */
export const GIT_CREDENTIAL_TTL_S = 50 * 60;

export function generateSandboxSecret(): string {
	return randomBytes(32).toString("hex");
}

export function hashSandboxSecret(secret: string): string {
	return createHash("sha256").update(secret).digest("hex");
}

function secretMatches(secret: string, storedHash: string): boolean {
	const a = Buffer.from(hashSandboxSecret(secret));
	const b = Buffer.from(storedHash);
	return a.length === b.length && timingSafeEqual(a, b);
}

export interface GitCredential {
	username: string;
	password: string;
	/** Unix seconds; emitted to git as `password_expiry_utc` (see GIT_CREDENTIAL_TTL_S). */
	expiresAt: number;
	/** Which identity the credential carries — surfaced, never silent. */
	identity: { kind: "app" };
}

async function appInstallationToken(projectId: string): Promise<string | null> {
	const repo = await repoForProject(projectId);
	if (!repo) return null;
	const row = await db.query.githubRepositories.findFirst({
		where: and(
			eq(githubRepositories.owner, repo.owner),
			eq(githubRepositories.name, repo.name),
		),
	});
	if (!row) return null;
	const installation = await db.query.githubInstallations.findFirst({
		where: eq(githubInstallations.id, row.installationId),
	});
	if (!installation) return null;
	const octokit = await installationOctokit(installation.installationId);
	// Narrowed to this repo and to pushing it. Unnarrowed, an installation
	// token covers every repo the App is installed on with every permission
	// it holds — a sandbox for project A could push project B. The invariant
	// clone-token.ts states for the initial clone holds here too: a leak must
	// be one repo for one hour, not an installation.
	const { token } = (await octokit.auth({
		type: "installation",
		repositoryNames: [repo.name],
		permissions: { contents: "write" },
	})) as { token: string };
	return token;
}

/**
 * The push-scope rule, on its own so it can be reasoned about without a
 * database. Returns the refusal message, or null to allow. An accident guard
 * over a helper-supplied branch — see the header — and deliberately lenient
 * when the branch is unknown: fetch and clone run outside a checkout, so an
 * absent branch is the honest read path, not an attacker hiding a push.
 */
export function pushRefusal(args: {
	target: string;
	workspaceBranch: string;
	defaultBranch: string | undefined;
}): string | null {
	const { target, workspaceBranch, defaultBranch } = args;
	if (!defaultBranch) return null;
	if (target === defaultBranch && workspaceBranch !== defaultBranch) {
		return `This workspace was created on ${workspaceBranch} and may not push to ${defaultBranch}`;
	}
	return null;
}

export async function mintGitCredential(input: {
	workspaceId: string;
	sandboxSecret: string;
	host: string;
	/** The branch git is about to push to, when known. */
	branch?: string;
}): Promise<GitCredential> {
	if (input.host !== "github.com") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: `No credential for ${input.host}`,
		});
	}

	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, input.workspaceId),
	});
	if (
		!row?.sandboxSecretHash ||
		!secretMatches(input.sandboxSecret, row.sandboxSecretHash)
	) {
		// Same answer for "no such workspace" and "wrong secret": a caller that
		// can distinguish them can enumerate workspaces.
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
	}
	if (row.status !== "ready") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `Cloud workspace is ${row.status}`,
		});
	}
	// Push scope. The threat is a prompt-injected agent pushing somewhere it
	// shouldn't — and the somewhere that matters is the default branch. So: a
	// workspace may push to any branch *except* the repo's default, unless the
	// default is the branch it was created on and is therefore its own. That
	// leaves the normal flow untouched (agent on main cuts feat/x, pushes it)
	// and closes the one that hurts (agent on feat/x force-pushes main).
	// Branch protection on the repo is the second wall behind this one.
	if (input.branch) {
		const repo = await repoForProject(row.projectId);
		const refusal = pushRefusal({
			target: input.branch,
			workspaceBranch: row.branch,
			defaultBranch: repo?.defaultBranch,
		});
		if (refusal) throw new TRPCError({ code: "FORBIDDEN", message: refusal });
	}

	const expiresAt = Math.floor(Date.now() / 1000) + GIT_CREDENTIAL_TTL_S;

	const app = await appInstallationToken(row.projectId);
	if (!app) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "No GitHub credential available for this workspace",
		});
	}
	return {
		username: "x-access-token",
		password: app,
		expiresAt,
		identity: { kind: "app" },
	};
}

/**
 * Issues the secret a sandbox proves itself with; returned once, stored hashed.
 *
 * Only ever written when the row has none. Provisioning can run more than once
 * for a row (a queued retry after the first attempt died mid-flight), and the
 * sandbox's environment is fixed at creation — so a second issue would leave
 * the row holding hash(B) while a live sandbox holds A, and every git
 * operation in it would 401 forever. Returns null when a secret already
 * exists, which callers treat as "keep the sandbox that has it".
 */
export async function issueSandboxSecret(
	workspaceId: string,
): Promise<string | null> {
	const secret = generateSandboxSecret();
	const [row] = await dbWs
		.update(cloudWorkspaces)
		.set({ sandboxSecretHash: hashSandboxSecret(secret) })
		.where(
			and(
				eq(cloudWorkspaces.id, workspaceId),
				isNull(cloudWorkspaces.sandboxSecretHash),
			),
		)
		.returning({ id: cloudWorkspaces.id });
	return row ? secret : null;
}
