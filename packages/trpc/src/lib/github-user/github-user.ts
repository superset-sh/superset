/**
 * A person's own GitHub account, authorized through the GitHub App's OAuth
 * client (a user-to-server token). A cloud workspace created by someone who
 * has connected pushes and opens pull requests as them, limited to what both
 * they and the App can reach; the token only ever lives in the API and the
 * sandbox firewall's header rule.
 */
import { db } from "@superset/db/client";
import { githubUserConnections } from "@superset/db/schema";
import { withConnectionLock } from "@superset/db/utils";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { open, seal } from "../secret-box";

const STATE_TTL_MS = 10 * 60_000;
/** Refresh a token this close to expiring, so a box never holds a dying one. */
const REFRESH_MARGIN_MS = 15 * 60_000;
const STATE_AAD = "github-user-connect";

export class GithubUserConnectionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GithubUserConnectionError";
	}
}

export function githubUserConnectionConfigured(): boolean {
	return Boolean(env.GH_APP_CLIENT_ID && env.GH_APP_CLIENT_SECRET);
}

function clientCredentials(): { clientId: string; clientSecret: string } {
	if (!env.GH_APP_CLIENT_ID || !env.GH_APP_CLIENT_SECRET) {
		throw new GithubUserConnectionError(
			"Connecting GitHub is not configured on this server",
		);
	}
	return {
		clientId: env.GH_APP_CLIENT_ID,
		clientSecret: env.GH_APP_CLIENT_SECRET,
	};
}

export function githubUserCallbackUrl(): string {
	return `${env.NEXT_PUBLIC_API_URL}/api/github/user/callback`;
}

function tokenAad(userId: string, kind: "access" | "refresh"): string {
	return `github-user:${kind}:${userId}`;
}

/** Where to send someone to authorize; the state is sealed, so it cannot be forged or replayed late. */
export function githubUserAuthorizeUrl(userId: string): string {
	const { clientId } = clientCredentials();
	const state = seal(
		JSON.stringify({ userId, expiresAt: Date.now() + STATE_TTL_MS }),
		STATE_AAD,
	);
	const url = new URL("https://github.com/login/oauth/authorize");
	url.searchParams.set("client_id", clientId);
	url.searchParams.set("redirect_uri", githubUserCallbackUrl());
	url.searchParams.set("state", state);
	return url.toString();
}

const statePayloadSchema = z.object({
	userId: z.string().uuid(),
	expiresAt: z.number(),
});

function readState(state: string): string {
	let payload: z.infer<typeof statePayloadSchema>;
	try {
		payload = statePayloadSchema.parse(JSON.parse(open(state, STATE_AAD)));
	} catch {
		throw new GithubUserConnectionError("The GitHub sign-in link is invalid");
	}
	if (payload.expiresAt < Date.now()) {
		throw new GithubUserConnectionError(
			"The GitHub sign-in link expired; connect again from Superset",
		);
	}
	return payload.userId;
}

const tokenResponseSchema = z.object({
	access_token: z.string().min(1),
	expires_in: z.number().optional(),
	refresh_token: z.string().optional(),
	refresh_token_expires_in: z.number().optional(),
});

async function exchange(
	params: Record<string, string>,
): Promise<z.infer<typeof tokenResponseSchema>> {
	const { clientId, clientSecret } = clientCredentials();
	const response = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: {
			accept: "application/json",
			"content-type": "application/json",
		},
		body: JSON.stringify({
			client_id: clientId,
			client_secret: clientSecret,
			...params,
		}),
		signal: AbortSignal.timeout(10_000),
	});
	const body: unknown = await response.json().catch(() => null);
	const parsed = tokenResponseSchema.safeParse(body);
	if (!response.ok || !parsed.success) {
		const reason =
			body && typeof body === "object" && "error" in body
				? String((body as { error: unknown }).error)
				: `HTTP ${response.status}`;
		throw new GithubUserConnectionError(`GitHub refused the token: ${reason}`);
	}
	return parsed.data;
}

function tokenColumns(
	userId: string,
	tokens: z.infer<typeof tokenResponseSchema>,
) {
	const now = Date.now();
	return {
		encryptedAccessToken: seal(tokens.access_token, tokenAad(userId, "access")),
		accessTokenExpiresAt: tokens.expires_in
			? new Date(now + tokens.expires_in * 1000)
			: null,
		encryptedRefreshToken: tokens.refresh_token
			? seal(tokens.refresh_token, tokenAad(userId, "refresh"))
			: null,
		refreshTokenExpiresAt: tokens.refresh_token_expires_in
			? new Date(now + tokens.refresh_token_expires_in * 1000)
			: null,
	};
}

const githubUserSchema = z.object({
	id: z.number(),
	login: z.string(),
	name: z.string().nullable().optional(),
});

/** Finishes the OAuth round trip: exchanges the code, reads who it is, stores the tokens. */
export async function completeGithubUserConnection(args: {
	code: string;
	state: string;
}): Promise<{ login: string }> {
	const userId = readState(args.state);
	const tokens = await exchange({
		code: args.code,
		redirect_uri: githubUserCallbackUrl(),
	});
	const response = await fetch("https://api.github.com/user", {
		headers: {
			accept: "application/vnd.github+json",
			authorization: `Bearer ${tokens.access_token}`,
			"x-github-api-version": "2022-11-28",
		},
		signal: AbortSignal.timeout(10_000),
	});
	const account = githubUserSchema.safeParse(
		await response.json().catch(() => null),
	);
	if (!response.ok || !account.success) {
		throw new GithubUserConnectionError(
			"GitHub did not say which account this is",
		);
	}
	const identity = {
		githubUserId: String(account.data.id),
		login: account.data.login,
		name: account.data.name ?? null,
	};
	const columns = tokenColumns(userId, tokens);
	await db
		.insert(githubUserConnections)
		.values({ userId, ...identity, ...columns })
		.onConflictDoUpdate({
			target: githubUserConnections.userId,
			set: { ...identity, ...columns },
		});
	return { login: identity.login };
}

export async function githubUserConnectionFor(userId: string): Promise<{
	githubUserId: string;
	login: string;
	name: string | null;
} | null> {
	const row = await db.query.githubUserConnections.findFirst({
		where: eq(githubUserConnections.userId, userId),
		columns: { githubUserId: true, login: true, name: true },
	});
	return row ?? null;
}

/**
 * A usable token for the person, refreshed when it is near expiry. Refreshing
 * rotates the refresh token, so two wakes refreshing at once would lock one
 * out: the refresh runs under a per-user lock and re-reads the row inside it.
 * A connection GitHub no longer honours is removed, and the caller falls back
 * to the App's token.
 */
export async function githubUserTokenFor(
	userId: string,
): Promise<string | null> {
	if (!githubUserConnectionConfigured()) return null;
	const fresh = (row: typeof githubUserConnections.$inferSelect) =>
		!row.accessTokenExpiresAt ||
		row.accessTokenExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS;
	const row = await db.query.githubUserConnections.findFirst({
		where: eq(githubUserConnections.userId, userId),
	});
	if (!row) return null;
	if (fresh(row))
		return open(row.encryptedAccessToken, tokenAad(userId, "access"));
	return withConnectionLock(`github-user:${userId}`, async (tx) => {
		const [current] = await tx
			.select()
			.from(githubUserConnections)
			.where(eq(githubUserConnections.userId, userId));
		if (!current) return null;
		if (fresh(current)) {
			return open(current.encryptedAccessToken, tokenAad(userId, "access"));
		}
		if (!current.encryptedRefreshToken) return null;
		try {
			const tokens = await exchange({
				grant_type: "refresh_token",
				refresh_token: open(
					current.encryptedRefreshToken,
					tokenAad(userId, "refresh"),
				),
			});
			await tx
				.update(githubUserConnections)
				.set(tokenColumns(userId, tokens))
				.where(eq(githubUserConnections.userId, userId));
			return tokens.access_token;
		} catch (error) {
			if (!(error instanceof GithubUserConnectionError)) throw error;
			console.warn(
				`[github-user] refresh failed for ${userId}; the connection is removed`,
				error.message,
			);
			await tx
				.delete(githubUserConnections)
				.where(eq(githubUserConnections.userId, userId));
			return null;
		}
	});
}

/** Removes the connection and revokes the grant, so GitHub forgets it too. */
export async function disconnectGithubUser(userId: string): Promise<void> {
	const row = await db.query.githubUserConnections.findFirst({
		where: eq(githubUserConnections.userId, userId),
	});
	if (!row) return;
	await db
		.delete(githubUserConnections)
		.where(eq(githubUserConnections.userId, userId));
	if (!githubUserConnectionConfigured()) return;
	const { clientId, clientSecret } = clientCredentials();
	await fetch(`https://api.github.com/applications/${clientId}/grant`, {
		method: "DELETE",
		headers: {
			accept: "application/vnd.github+json",
			authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
			"x-github-api-version": "2022-11-28",
		},
		body: JSON.stringify({
			access_token: open(row.encryptedAccessToken, tokenAad(userId, "access")),
		}),
		signal: AbortSignal.timeout(10_000),
	}).catch((error) => {
		console.warn("[github-user] could not revoke the grant", error);
	});
}

/** The repositories the person cannot see on GitHub, by full name. */
export async function githubRepositoriesOutOfReach(args: {
	token: string;
	repositories: ReadonlyArray<{
		owner: string;
		name: string;
		fullName: string;
	}>;
}): Promise<string[]> {
	const results = await Promise.all(
		args.repositories.map(async (repository) => {
			const response = await fetch(
				`https://api.github.com/repos/${repository.owner}/${repository.name}`,
				{
					headers: {
						accept: "application/vnd.github+json",
						authorization: `Bearer ${args.token}`,
						"x-github-api-version": "2022-11-28",
					},
					signal: AbortSignal.timeout(10_000),
				},
			).catch(() => null);
			return response?.ok ? null : repository.fullName;
		}),
	);
	return results.filter((name): name is string => name !== null);
}
