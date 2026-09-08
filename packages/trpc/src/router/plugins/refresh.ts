import type { SelectPluginConnection } from "@superset/db/schema";
import {
	connectionSecrets,
	manifestAuth,
	updateConnectionTokens,
} from "./connections";
import { authMethod, type PluginManifest } from "./manifest";
import { refreshToken } from "./oauth";

export async function ensureFreshConnection(
	connection: SelectPluginConnection,
	manifest: PluginManifest,
): Promise<SelectPluginConnection> {
	if (!connection.tokenExpiresAt || connection.tokenExpiresAt > new Date()) {
		return connection;
	}

	const auth = authMethod(manifestAuth(manifest), connection.authMethod);
	if (!auth || auth.type !== "oauth2") return connection;

	const secrets = await connectionSecrets(connection);
	if (!secrets.refreshToken) {
		throw new Error(
			`The ${connection.pluginName} token expired and no refresh token is stored; reconnect the plugin.`,
		);
	}

	const refreshed = await refreshToken(
		connection.pluginName,
		auth,
		{ inputs: secrets.inputs },
		secrets.refreshToken,
		manifest,
	);
	return await updateConnectionTokens(connection.id, refreshed);
}
