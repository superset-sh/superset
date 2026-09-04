import { auth } from "@superset/auth/server";
import {
	AmbiguousPluginError,
	authMethod,
	buildAuthorizationUrl,
	installedManifest,
	manifestAuth,
} from "@superset/trpc/integrations/plugins";
import { createSignedState } from "@/lib/oauth-state";

/**
 * Starts an OAuth2 connection by redirecting to the provider.
 *
 * Stays a raw route because it answers with a redirect the desktop opens in
 * the system browser. Inputs travel through the signed state so the callback
 * can re-resolve `${inputs.site}` when exchanging the code against a
 * per-tenant token_url; api_key connections go through plugins.connectApiKey,
 * so a credential never enters a URL.
 */
export async function GET(
	request: Request,
	{ params }: { params: Promise<{ plugin: string }> },
) {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { plugin } = await params;
	const url = new URL(request.url);

	let manifest: Awaited<ReturnType<typeof installedManifest>>;
	try {
		manifest = await installedManifest(session.user.id, plugin);
	} catch (error) {
		if (error instanceof AmbiguousPluginError) {
			return Response.json({ error: error.message }, { status: 409 });
		}
		throw error;
	}
	if (!manifest) {
		return Response.json(
			{ error: `Plugin "${plugin}" is not installed` },
			{ status: 404 },
		);
	}

	const requested = url.searchParams.get("method") ?? undefined;
	const authSpec = authMethod(manifestAuth(manifest), requested);
	if (!authSpec) {
		return Response.json(
			{
				error: requested
					? `Plugin "${plugin}" declares no "${requested}" auth method`
					: `Plugin "${plugin}" needs a method: it offers more than one`,
			},
			{ status: 400 },
		);
	}

	if (authSpec.type === "api_key") {
		return Response.json(
			{
				error:
					"api_key plugins connect through the plugins.connectApiKey procedure, so the credential never enters a URL.",
			},
			{ status: 405 },
		);
	}

	const secrets = (authSpec.inputs ?? []).filter((input) => input.secret);
	if (secrets.length) {
		return Response.json(
			{
				error: `Plugin "${plugin}" declares ${secrets
					.map((input) => `"${input.name}"`)
					.join(
						", ",
					)} as secret on its ${authSpec.type} method. A browser authorization URL cannot carry a secret.`,
			},
			{ status: 400 },
		);
	}

	const inputs: Record<string, string> = {};
	for (const input of authSpec.inputs ?? []) {
		const value = url.searchParams.get(input.name);
		if (value) inputs[input.name] = value;
		else if (input.required) {
			return Response.json(
				{ error: `Missing required input "${input.name}"` },
				{ status: 400 },
			);
		}
	}

	const state = createSignedState({
		userId: session.user.id,
		pluginName: plugin,
		authMethod: authSpec.type,
		inputs,
	});

	try {
		return Response.redirect(
			buildAuthorizationUrl(plugin, authSpec, { inputs }, state),
		);
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : String(error) },
			{ status: 500 },
		);
	}
}
