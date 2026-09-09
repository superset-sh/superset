import type { SelectPluginConnection } from "@superset/db/schema";
import {
	connectionSecrets,
	manifestAuth,
	updateConnectionTokens,
} from "./connections";
import { authMethod, type PluginManifest } from "./manifest";
import { refreshToken } from "./oauth";

const refreshing = new Map<string, Promise<SelectPluginConnection>>();

async function refreshConnection(
	connection: SelectPluginConnection,
	manifest: PluginManifest,
	marketplace: string,
): Promise<SelectPluginConnection> {
	const auth = authMethod(manifestAuth(manifest), connection.authMethod);
	if (!auth || auth.type !== "oauth2") return connection;

	const secrets = await connectionSecrets(connection);
	if (!secrets.refreshToken) {
		throw new Error(
			`The ${connection.pluginName} connection expired and holds no refresh token; reconnect the plugin.`,
		);
	}

	const refreshed = await refreshToken(
		connection.pluginName,
		auth,
		{ inputs: secrets.inputs },
		secrets.refreshToken,
		manifest,
		marketplace,
	);
	return await updateConnectionTokens(connection, refreshed);
}

export async function ensureFreshConnection(
	connection: SelectPluginConnection,
	manifest: PluginManifest,
	marketplace: string,
): Promise<SelectPluginConnection> {
	if (!connection.tokenExpiresAt || connection.tokenExpiresAt > new Date()) {
		return connection;
	}

	const pending = refreshing.get(connection.id);
	if (pending) return await pending;

	const attempt = refreshConnection(connection, manifest, marketplace).finally(
		() => refreshing.delete(connection.id),
	);
	refreshing.set(connection.id, attempt);
	return await attempt;
}
