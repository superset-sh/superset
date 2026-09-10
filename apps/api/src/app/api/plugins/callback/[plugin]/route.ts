import { auth } from "@superset/auth/server";
import {
	authMethod,
	exchangeCode,
	installedPlugin,
	manifestAuth,
	resolveIdentity,
	trustedManifest,
	upsertConnection,
} from "@superset/trpc/integrations/plugins";
import { env } from "@/env";
import { pluginStateSchema, verifySignedState } from "@/lib/oauth-state";

function settingsRedirect(plugin: string, params: Record<string, string>) {
	const url = new URL(`${env.NEXT_PUBLIC_WEB_URL}/plugins/${plugin}`);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	return Response.redirect(url.toString());
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ plugin: string }> },
) {
	const { plugin } = await params;
	const url = new URL(request.url);

	if (url.searchParams.get("error")) {
		return settingsRedirect(plugin, { error: "oauth_denied" });
	}

	const code = url.searchParams.get("code");
	const stateToken = url.searchParams.get("state");
	if (!code || !stateToken) {
		return settingsRedirect(plugin, { error: "missing_params" });
	}

	const state = verifySignedState(stateToken, pluginStateSchema);
	if (!state || state.pluginName !== plugin) {
		return settingsRedirect(plugin, { error: "invalid_state" });
	}

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user || session.user.id !== state.userId) {
		return settingsRedirect(plugin, { error: "unauthorized" });
	}

	let install: Awaited<ReturnType<typeof installedPlugin>>;
	try {
		install = await installedPlugin(state.userId, plugin);
	} catch {
		return settingsRedirect(plugin, { error: "ambiguous_plugin" });
	}
	const authSpec = install
		? authMethod(manifestAuth(install.manifest), state.authMethod)
		: null;
	if (!install || !authSpec) {
		return settingsRedirect(plugin, { error: "not_installed" });
	}

	try {
		const token = await exchangeCode(
			plugin,
			authSpec,
			{ inputs: state.inputs },
			code,
		);

		const identity = await resolveIdentity(
			trustedManifest(install.marketplace) ? authSpec.identity : undefined,
			{ config: { access_token: token.accessToken }, inputs: state.inputs },
			authSpec.type,
			authSpec,
		);

		await upsertConnection({
			installId: install.id,
			userId: state.userId,
			organizationId: null,
			pluginName: plugin,
			authMethod: authSpec.type,
			accessToken: token.accessToken,
			refreshToken: token.refreshToken,
			tokenExpiresAt: token.expiresAt,
			scopes: token.scopes,
			inputs: state.inputs,
			secretInputs: (authSpec.inputs ?? [])
				.filter((input) => input.secret)
				.map((input) => input.name),
			externalAccountId: identity.id,
			externalAccountLabel: identity.label,
		});

		return settingsRedirect(plugin, { connected: identity.label ?? "1" });
	} catch (error) {
		console.error(`Plugin ${plugin} callback failed:`, error);
		return settingsRedirect(plugin, { error: "connection_failed" });
	}
}
