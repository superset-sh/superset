import { db } from "@superset/db/client";
import { connections, type GitLabConfig } from "@superset/db/schema";
import { withConnectionLock } from "@superset/db/utils";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import {
	decryptOptional,
	decryptSecret,
	encryptOptional,
	encryptSecret,
} from "../../router/plugins/crypto";
import { GitlabApiError, gitlabApiFetch } from "./api";
import { readGitlabConfig } from "./config";
import { refreshGitlabToken } from "./refresh";
import { gitlabAccountIdentity, gitlabScopeAllows } from "./scope";
import { parseGitLabOrigin } from "./ssrf";

export { readGitlabConfig } from "./config";
export type GitlabConnectionConfig = GitLabConfig;
export interface GitlabCredentials {
	connectionId: string;
	organizationId: string;
	token: string;
	config: GitlabConnectionConfig;
}
export interface GitlabCredentialsOptions {
	organizationId?: string;
	expected?: { host: string; projectPath?: string };
	send?: typeof gitlabApiFetch;
	refresh?: typeof refreshGitlabToken;
}
export interface SaveGitlabConnectionInput {
	organizationId: string;
	userId: string;
	token: string;
	refreshToken?: string | null;
	expiresAt?: Date | null;
	auth: "oauth" | "token";
	host: string;
	groupPath: string | null;
	scopeKind?: "project" | "group";
	scopeId?: string;
	externalAccountId: string;
	externalAccountLabel: string | null;
	webhookSecret: string;
}
export type SaveGitlabConnectionResult =
	| { ok: false; reason: "already_connected" }
	| { ok: true; connectionId: string; webhookSecret: string };

function orgConnection(organizationId?: string) {
	return and(
		eq(connections.connector, "gitlab"),
		eq(connections.ownerKind, "org"),
		...(organizationId ? [eq(connections.organizationId, organizationId)] : []),
	);
}

function sameScope(
	left: GitlabConnectionConfig,
	right: GitlabConnectionConfig,
): boolean {
	return (
		left.host === right.host &&
		left.groupPath === right.groupPath &&
		(left.scopeKind ?? "project") === (right.scopeKind ?? "project")
	);
}

function matchesExpected(
	config: GitlabConnectionConfig,
	expected: GitlabCredentialsOptions["expected"],
): boolean {
	if (!expected) return true;
	try {
		return (
			config.host === parseGitLabOrigin(expected.host).host &&
			(expected.projectPath === undefined ||
				gitlabScopeAllows(config, expected.projectPath))
		);
	} catch {
		return false;
	}
}

export async function gitlabConnectionForOrg(
	organizationId: string,
	opts: { includeDisconnected?: boolean } = {},
) {
	return db.query.connections.findFirst({
		where: and(
			orgConnection(organizationId),
			...(opts.includeDisconnected ? [] : [isNull(connections.disconnectedAt)]),
		),
	});
}
export async function gitlabCredentialsFor(
	connectionId: string,
	options: GitlabCredentialsOptions = {},
): Promise<GitlabCredentials | null> {
	const where = and(
		eq(connections.id, connectionId),
		orgConnection(options.organizationId),
		isNull(connections.disconnectedAt),
	);
	const row = await db.query.connections.findFirst({ where });
	if (!row) return null;
	let config = readGitlabConfig(row.state);
	if (!config || !matchesExpected(config, options.expected)) return null;
	let token: string;
	let ciphertext = row.accessToken;
	try {
		token = await decryptSecret(row.accessToken);
		if (config.auth === "oauth") await decryptOptional(row.refreshToken);
	} catch {
		return null;
	}
	if (config.auth === "oauth") {
		const refreshed = await (options.refresh ?? refreshGitlabToken)(
			connectionId,
			{ organizationId: options.organizationId },
		);
		if (refreshed.disconnected) return null;
		token = refreshed.accessToken;
		const current = await withConnectionLock(connectionId, async (tx) => {
			const [snapshot] = await tx
				.select({
					accessToken: connections.accessToken,
					state: connections.state,
				})
				.from(connections)
				.where(where)
				.limit(1);
			if (!snapshot || (await decryptSecret(snapshot.accessToken)) !== token)
				return null;
			const latest = readGitlabConfig(snapshot.state);
			return latest && matchesExpected(latest, options.expected)
				? { config: latest, ciphertext: snapshot.accessToken }
				: null;
		});
		if (!current) return null;
		config = current.config;
		ciphertext = current.ciphertext;
	}
	const response = await (options.send ?? gitlabApiFetch)(
		`https://${config.host}`,
		token,
		"/user",
	);
	if (!response.ok && response.status !== 401)
		throw new GitlabApiError(response.status, "/user");
	return withConnectionLock(connectionId, async (tx) => {
		const [current] = await tx
			.select({
				accessToken: connections.accessToken,
				state: connections.state,
			})
			.from(connections)
			.where(where)
			.limit(1);
		const latest = readGitlabConfig(current?.state);
		if (
			!current ||
			current.accessToken !== ciphertext ||
			!latest ||
			!sameScope(config, latest)
		)
			return null;
		if (response.status === 401) {
			await tx
				.update(connections)
				.set({ disconnectedAt: new Date(), disconnectReason: "needs_reauth" })
				.where(where);
			return null;
		}
		return {
			connectionId,
			organizationId: row.organizationId,
			token,
			config: latest,
		};
	});
}
export async function saveGitlabConnection(
	input: SaveGitlabConnectionInput,
): Promise<SaveGitlabConnectionResult> {
	const config = readGitlabConfig({
		provider: "gitlab",
		host: input.host,
		groupPath: input.groupPath,
		auth: input.auth,
		webhookSecret: input.webhookSecret,
		scopeKind: input.scopeKind ?? "project",
		scopeId: input.scopeId,
	});
	if (!config) throw new Error("Invalid GitLab connection config");
	const externalAccountId = gitlabAccountIdentity(
		config.host,
		config.scopeKind ?? "project",
		config.groupPath ?? input.externalAccountId,
	);
	return withConnectionLock(
		`gitlab-org:${input.organizationId}`,
		async (tx) => {
			await tx.execute(
				sql`SELECT pg_advisory_xact_lock(hashtextextended(${`gitlab-account:${externalAccountId}`}::text, 0))`,
			);
			const candidates = await tx
				.select({
					externalAccountId: connections.externalAccountId,
					state: connections.state,
				})
				.from(connections)
				.where(
					and(
						orgConnection(),
						isNull(connections.disconnectedAt),
						ne(connections.organizationId, input.organizationId),
						or(
							eq(connections.externalAccountId, externalAccountId),
							and(
								sql`${connections.state}->>'groupPath' IS NOT DISTINCT FROM ${config.groupPath}`,
								sql`COALESCE(${connections.state}->>'scopeKind', 'project') = ${config.scopeKind ?? "project"}`,
								...(config.groupPath === null
									? [eq(connections.externalAccountId, input.externalAccountId)]
									: []),
							),
						),
					),
				);
			if (
				candidates.some((candidate) => {
					if (candidate.externalAccountId === externalAccountId) return true;
					const previous = readGitlabConfig(candidate.state);
					return previous !== null && sameScope(previous, config);
				})
			)
				return { ok: false, reason: "already_connected" };
			const [existing] = await tx
				.select({ id: connections.id, state: connections.state })
				.from(connections)
				.where(orgConnection(input.organizationId))
				.limit(1);
			if (existing)
				await tx.execute(
					sql`SELECT pg_advisory_xact_lock(hashtextextended(${existing.id}::text, 0))`,
				);
			const previous = readGitlabConfig(existing?.state);
			if (previous && sameScope(previous, config))
				config.webhookSecret = previous.webhookSecret;
			const values = {
				organizationId: input.organizationId,
				connectedByUserId: input.userId,
				connector: "gitlab",
				ownerKind: "org",
				authMethod: input.auth === "oauth" ? "oauth2" : "token",
				accessToken: await encryptSecret(input.token),
				refreshToken: await encryptOptional(input.refreshToken),
				tokenExpiresAt: input.expiresAt ?? null,
				scopes: ["api", "read_repository"],
				externalAccountId,
				externalAccountLabel: input.externalAccountLabel,
				externalUserId: null,
				state: config,
				disconnectedAt: null,
				disconnectReason: null,
			};
			const [row] = await tx
				.insert(connections)
				.values(values)
				.onConflictDoUpdate({
					target: [connections.organizationId, connections.connector],
					targetWhere: sql`${connections.ownerKind} = 'org'`,
					set: values,
				})
				.returning({ id: connections.id });
			return row
				? {
						ok: true,
						connectionId: row.id,
						webhookSecret: config.webhookSecret,
					}
				: { ok: false, reason: "already_connected" };
		},
	);
}
