import { randomBytes } from "node:crypto";
import { connections, type SelectConnection } from "@superset/db/schema";
import { withConnectionLock } from "@superset/db/utils";
import {
	decryptSecret,
	encryptSecret,
} from "@superset/trpc/integrations/plugins";
import {
	gitlabPaginated,
	gitlabProjectsForScope,
} from "@superset/trpc/lib/gitlab/api";
import { readGitlabConfig } from "@superset/trpc/lib/gitlab/config";
import {
	gitlabConnectionForOrg,
	gitlabCredentialsFor,
	saveGitlabConnection,
} from "@superset/trpc/lib/gitlab/connection";
import { revokeGitlabOAuth } from "@superset/trpc/lib/gitlab/disconnect";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { resolveGitlabWebhookOrigin } from "@/lib/gitlabWebhookOrigin";
import type { OrgMember } from "@/lib/integrations/requireOrgMember";
import {
	type GitlabIdentity,
	gitlabFetch,
	gitlabWebhookUrl,
	hookProjectIds,
	registerProjectHook,
} from "./gitlab-api";

type Config = NonNullable<ReturnType<typeof readGitlabConfig>>;
type LockTx = Parameters<Parameters<typeof withConnectionLock>[1]>[0];
type Generation = {
	id: string;
	organizationId: string;
	ciphertext: string;
	config: Config;
	rawState: string;
	disconnectedAt: number | null;
	token: string;
};
export class StaleGitlabConnection extends Error {}

function owned(
	row: SelectConnection | undefined,
	organizationId: string,
): row is SelectConnection {
	return (
		row?.organizationId === organizationId &&
		row.connector === "gitlab" &&
		row.ownerKind === "org"
	);
}
async function read(tx: LockTx, id: string, organizationId: string) {
	const [row] = await tx
		.select()
		.from(connections)
		.where(
			and(
				eq(connections.id, id),
				eq(connections.organizationId, organizationId),
				eq(connections.connector, "gitlab"),
				eq(connections.ownerKind, "org"),
			),
		)
		.limit(1);
	return owned(row, organizationId) && row.id === id ? row : undefined;
}
function generation(
	row: SelectConnection,
	config: Config,
	token: string,
): Generation {
	return {
		id: row.id,
		organizationId: row.organizationId,
		ciphertext: row.accessToken,
		config,
		rawState: JSON.stringify(row.state),
		disconnectedAt: row.disconnectedAt?.getTime() ?? null,
		token,
	};
}
async function assertCurrent(tx: LockTx, snapshot: Generation): Promise<void> {
	const row = await read(tx, snapshot.id, snapshot.organizationId);
	const config = readGitlabConfig(row?.state);
	if (
		!row ||
		row.accessToken !== snapshot.ciphertext ||
		(row.disconnectedAt?.getTime() ?? null) !== snapshot.disconnectedAt ||
		!config ||
		JSON.stringify(row.state) !== snapshot.rawState ||
		JSON.stringify(config) !== JSON.stringify(snapshot.config)
	)
		throw new StaleGitlabConnection();
}
async function whenCurrent<T>(
	snapshot: Generation,
	action: () => Promise<T>,
): Promise<T> {
	return withConnectionLock(snapshot.id, async (tx) => {
		await assertCurrent(tx, snapshot);
		return action();
	});
}
function mutationSend(snapshot: Generation): typeof gitlabFetch {
	return (origin, token, path, init = {}) => {
		if (
			origin !== `https://${snapshot.config.host}` ||
			token !== snapshot.token
		)
			throw new StaleGitlabConnection();
		if (!init.method || ["GET", "HEAD"].includes(init.method.toUpperCase()))
			return gitlabFetch(origin, token, path, init);
		return whenCurrent(snapshot, () => gitlabFetch(origin, token, path, init));
	};
}

async function registerCurrentHook(
	snapshot: Generation,
	args: Parameters<typeof registerProjectHook>[0],
): Promise<void> {
	await withConnectionLock(snapshot.id, async (tx) => {
		await assertCurrent(tx, snapshot);
		const send: typeof gitlabFetch = async (origin, token, path, init = {}) => {
			await assertCurrent(tx, snapshot);
			if (
				origin !== `https://${snapshot.config.host}` ||
				token !== snapshot.token
			)
				throw new StaleGitlabConnection();
			return gitlabFetch(origin, token, path, init);
		};
		await registerProjectHook({ ...args, send });
	});
}

export async function gitlabHookAccess(
	connectionId: string,
	organizationId: string,
) {
	const credentials = await gitlabCredentialsFor(connectionId, {
		organizationId,
	});
	if (
		!credentials ||
		credentials.connectionId !== connectionId ||
		credentials.organizationId !== organizationId
	)
		return null;
	const snapshot = await withConnectionLock(connectionId, async (tx) => {
		const row = await read(tx, connectionId, organizationId);
		const config = readGitlabConfig(row?.state);
		if (
			!row ||
			row.disconnectedAt ||
			!config ||
			JSON.stringify(config) !== JSON.stringify(credentials.config) ||
			(await decryptSecret(row.accessToken)) !== credentials.token
		)
			return null;
		return generation(row, config, credentials.token);
	});
	return snapshot
		? {
				config: snapshot.config,
				token: snapshot.token,
				send: mutationSend(snapshot),
				registerHook: (args: Parameters<typeof registerProjectHook>[0]) =>
					registerCurrentHook(snapshot, args),
			}
		: null;
}

export async function completeGitlabConnection(options: {
	member: OrgMember;
	origin: string;
	token: string;
	auth: "token" | "oauth";
	identity: GitlabIdentity;
	refreshToken?: string;
	expiresAt?: Date;
	hookApiOrigin?: string;
}): Promise<{ connected: boolean; hookFailed: boolean }> {
	const { member, origin, token, identity } = options;
	const groupPath = identity.groupPath;
	if (!groupPath) throw new Error("GitLab identity has no selected scope");
	const scopeKind = identity.project ? "project" : "group";
	const saved = await saveGitlabConnection({
		organizationId: member.organizationId,
		userId: member.userId,
		token,
		refreshToken: options.refreshToken,
		expiresAt: options.expiresAt,
		auth: options.auth,
		host: new URL(origin).host,
		groupPath,
		scopeKind,
		scopeId: identity.project?.id ?? identity.groupId ?? undefined,
		externalAccountId: groupPath,
		externalAccountLabel: groupPath,
		webhookSecret: randomBytes(24).toString("base64url"),
	});
	if (!saved.ok) return { connected: false, hookFailed: false };
	try {
		const snapshot = await withConnectionLock(
			saved.connectionId,
			async (tx) => {
				const row = await read(tx, saved.connectionId, member.organizationId);
				const config = readGitlabConfig(row?.state);
				if (
					!row ||
					row.disconnectedAt ||
					!config ||
					config.host !== new URL(origin).host ||
					config.groupPath !== groupPath ||
					(config.scopeKind ?? "project") !== scopeKind ||
					config.scopeId !==
						(identity.project?.id ?? identity.groupId ?? undefined) ||
					config.auth !== options.auth ||
					config.webhookSecret !== saved.webhookSecret ||
					(await decryptSecret(row.accessToken)) !== token
				)
					throw new StaleGitlabConnection();
				return generation(row, config, token);
			},
		);
		const projectIds = await hookProjectIds({ origin, token, identity });
		for (const projectId of projectIds)
			await registerCurrentHook(snapshot, {
				origin,
				token,
				projectId,
				hookUrl: gitlabWebhookUrl(
					resolveGitlabWebhookOrigin(
						env.GITLAB_WEBHOOK_ORIGIN,
						options.hookApiOrigin ?? env.NEXT_PUBLIC_API_URL,
					),
					saved.connectionId,
				),
				secret: saved.webhookSecret,
			});
		return { connected: true, hookFailed: false };
	} catch {
		return { connected: true, hookFailed: true };
	}
}

export async function disconnectGitlabConnection(
	member: OrgMember,
	hookApiOrigin = env.NEXT_PUBLIC_API_URL,
): Promise<{ disconnected: boolean; cleanupFailed: boolean }> {
	const hookOrigin = resolveGitlabWebhookOrigin(
		env.GITLAB_WEBHOOK_ORIGIN,
		hookApiOrigin,
	);
	const connection = await gitlabConnectionForOrg(member.organizationId, {
		includeDisconnected: true,
	});
	if (!connection) return { disconnected: false, cleanupFailed: false };
	const cleared = await withConnectionLock(connection.id, async (tx) => {
		const row = await read(tx, connection.id, member.organizationId);
		if (!row)
			return { disconnected: false, cleanupFailed: false, snapshot: null };
		if (
			row.accessToken !== connection.accessToken ||
			JSON.stringify(row.state) !== JSON.stringify(connection.state) ||
			(row.disconnectedAt?.getTime() ?? null) !==
				(connection.disconnectedAt?.getTime() ?? null)
		)
			return { disconnected: false, cleanupFailed: false, snapshot: null };
		if (row.disconnectedAt)
			return { disconnected: true, cleanupFailed: false, snapshot: null };
		const config = readGitlabConfig(row.state);
		let token: string | null = null;
		try {
			token = await decryptSecret(row.accessToken);
		} catch {}
		const ciphertext = await encryptSecret("");
		const disconnectedAt = new Date();
		await tx
			.update(connections)
			.set({
				accessToken: ciphertext,
				refreshToken: null,
				disconnectedAt,
				disconnectReason: "user",
			})
			.where(
				and(
					eq(connections.id, row.id),
					eq(connections.organizationId, member.organizationId),
					eq(connections.connector, "gitlab"),
					eq(connections.ownerKind, "org"),
				),
			);
		return {
			disconnected: true,
			cleanupFailed: !config || !token,
			snapshot:
				config && token
					? generation(
							{ ...row, accessToken: ciphertext, disconnectedAt },
							config,
							token,
						)
					: null,
		};
	});
	const snapshot = cleared.snapshot;
	if (!snapshot)
		return {
			disconnected: cleared.disconnected,
			cleanupFailed: cleared.cleanupFailed,
		};
	let cleanupFailed = false;
	const origin = `https://${snapshot.config.host}`;
	const hookUrl = gitlabWebhookUrl(hookOrigin, connection.id);
	const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
	const hookSchema = z.object({ id: positiveId, url: z.string() });
	try {
		const projects = await gitlabProjectsForScope(
			origin,
			snapshot.token,
			snapshot.config,
		);
		for (const project of projects) {
			if (!positiveId.safeParse(project.id).success)
				throw new Error("Invalid GitLab cleanup project ID");
			const hooks = await gitlabPaginated<unknown>(
				origin,
				snapshot.token,
				`/projects/${project.id}/hooks`,
			);
			for (const item of hooks) {
				const hook = hookSchema.safeParse(item);
				if (!hook.success) {
					if (
						item &&
						typeof item === "object" &&
						"url" in item &&
						item.url === hookUrl
					)
						cleanupFailed = true;
					continue;
				}
				if (hook.data.url !== hookUrl) continue;
				const deleted = await whenCurrent(snapshot, () =>
					gitlabFetch(
						origin,
						snapshot.token,
						`/projects/${project.id}/hooks/${hook.data.id}`,
						{ method: "DELETE" },
					),
				);
				if (!deleted.ok && deleted.status !== 404) cleanupFailed = true;
			}
		}
	} catch (error) {
		if (error instanceof StaleGitlabConnection)
			return { disconnected: true, cleanupFailed };
		cleanupFailed = true;
	}
	if (snapshot.config.auth === "oauth") {
		try {
			await whenCurrent(snapshot, () =>
				revokeGitlabOAuth(snapshot.config.host, snapshot.token, {
					clientId: env.GITLAB_OAUTH_CLIENT_ID,
					clientSecret: env.GITLAB_OAUTH_CLIENT_SECRET,
					issuer: env.GITLAB_ISSUER,
				}),
			);
		} catch (error) {
			if (!(error instanceof StaleGitlabConnection)) cleanupFailed = true;
		}
	}
	return { disconnected: true, cleanupFailed };
}
