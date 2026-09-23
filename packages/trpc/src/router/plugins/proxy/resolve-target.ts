import type { SelectConnection } from "@superset/db/schema";
import { getConnector, secretInputNames } from "@superset/shared/connectors";
import { env } from "../../../env";
import { connectionById } from "../../../lib/connectors/lookup";
import {
	ConnectorUnavailableError,
	ensureFreshConnection,
	UnrefreshableConnectionError,
} from "../../../lib/connectors/refresh";
import {
	activeConnection,
	type ConnectionSecrets,
	connectionSecrets,
} from "../../../lib/connectors/upsert";
import { installedPlugin } from "../connections";
import {
	type PluginManifest,
	resolveTemplateDeep,
	resolveUrlTemplate,
	supersetExtension,
	type TemplateScope,
	trustedManifest,
} from "../manifest";
import { type FirstPartyServer, firstPartyServer } from "../servers";

export class PluginTargetError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
	}
}

export interface TargetIdentity {
	plugin: string;
	version: string;
}

export type PluginTarget = TargetIdentity &
	(
		| {
				kind: "first-party";
				build: FirstPartyServer;
				secrets: ConnectionSecrets;
				connectionId: string;
		  }
		| {
				kind: "remote";
				url: string;
				headers: Record<string, string>;
				connectionId: string;
		  }
		| {
				kind: "needs-auth";
				connector: string;
				connectUrl: string;
				reason?: string;
		  }
	);

export interface TargetRequest {
	userId: string;
	organizationId: string | null;
	/** Omitted by in-process callers with no URL to read it from; the install
	 * is then resolved by name alone and ambiguity across marketplaces throws. */
	marketplace?: string;
	plugin: string;
	connectionId?: string | null;
}

function connectUrl(slug: string, organizationId: string | null): string {
	const params = new URLSearchParams({ method: "oauth2" });
	if (organizationId) params.set("organizationId", organizationId);
	return `${env.NEXT_PUBLIC_API_URL}/api/connectors/${slug}/connect?${params}`;
}

async function pinnedConnection(
	connectionId: string,
	slug: string,
	{ userId, organizationId }: TargetRequest,
): Promise<SelectConnection | null> {
	const row = await connectionById(connectionId, { connector: slug });
	if (!row) return null;
	if (row.connectedByUserId !== userId) return null;
	if (organizationId && row.organizationId !== organizationId) return null;
	return row;
}

function remoteBinding(
	manifest: PluginManifest,
	slug: string | undefined,
	scope: TemplateScope,
	authMethod: string | null,
): { url: string; headers: Record<string, string> } | null {
	const extension = supersetExtension(manifest);
	const mcp = extension?.mcp;
	if (!mcp?.url) return null;

	const connector = slug ? getConnector(slug) : undefined;
	const method = authMethod
		? connector?.methods.find((entry) => entry.type === authMethod)
		: connector?.methods[0];

	return {
		url: resolveUrlTemplate(
			mcp.url,
			scope,
			method ? secretInputNames(method) : undefined,
			"mcp.url",
		),
		headers: {
			...resolveTemplateDeep(mcp.headers ?? {}, scope),
			...resolveTemplateDeep(method?.bind ?? extension?.bind ?? {}, scope)
				.headers,
		},
	};
}

export async function resolveTarget(
	request: TargetRequest,
): Promise<PluginTarget> {
	const install = await installedPlugin(
		request.userId,
		request.plugin,
		request.marketplace,
	);
	if (!install) {
		throw new PluginTargetError(
			request.marketplace
				? `"${request.plugin}" is not installed from ${request.marketplace}.`
				: `"${request.plugin}" is not installed.`,
			404,
		);
	}

	const identity: TargetIdentity = {
		plugin: install.manifest.name,
		version: install.manifest.version,
	};
	const slug = install.connector;
	// A hosted server runs against a first-party connection, so only a
	// first-party manifest may claim one: otherwise any marketplace could
	// publish a plugin named "gmail" and be handed the real Gmail tools.
	const local = trustedManifest(install.marketplace)
		? firstPartyServer(install.manifest.name)
		: undefined;

	if (!slug) {
		const binding = remoteBinding(install.manifest, slug, {}, null);
		if (!binding) {
			throw new PluginTargetError(`"${request.plugin}" exposes no tools.`, 404);
		}
		return {
			...identity,
			kind: "remote",
			...binding,
			connectionId: install.id,
		};
	}

	const row = request.connectionId
		? await pinnedConnection(request.connectionId, slug, request)
		: await activeConnection(request.userId, slug, request.organizationId);
	if (!row) {
		return {
			...identity,
			kind: "needs-auth",
			connector: slug,
			connectUrl: connectUrl(slug, request.organizationId),
		};
	}

	let secrets: ConnectionSecrets;
	let authMethod: string | null;
	try {
		const fresh = await ensureFreshConnection(row);
		authMethod = fresh.authMethod;
		secrets = await connectionSecrets(fresh);
	} catch (error) {
		if (error instanceof UnrefreshableConnectionError) {
			return {
				...identity,
				kind: "needs-auth",
				connector: slug,
				connectUrl: connectUrl(slug, request.organizationId),
				reason: error.message,
			};
		}
		// The provider is down, not the connection: sending the user to
		// reconnect would be a lie they cannot act on.
		if (error instanceof ConnectorUnavailableError) {
			throw new PluginTargetError(error.message, 502);
		}
		throw error;
	}

	if (local) {
		return {
			...identity,
			kind: "first-party",
			build: local,
			secrets,
			connectionId: row.id,
		};
	}

	const scope: TemplateScope = {
		config: { access_token: secrets.accessToken, ...secrets.config },
	};
	const binding = remoteBinding(install.manifest, slug, scope, authMethod);
	if (!binding) {
		throw new PluginTargetError(
			`"${request.plugin}" declares no mcp url and has no first-party server.`,
			501,
		);
	}

	return { ...identity, kind: "remote", ...binding, connectionId: row.id };
}
