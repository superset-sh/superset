import {
	clientMetadataUrl,
	redirectUri,
} from "@superset/trpc/integrations/plugins";

const PLUGIN_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ plugin: string }> },
) {
	const { plugin } = await params;
	if (!PLUGIN_NAME.test(plugin)) {
		return Response.json({ error: "Unknown plugin" }, { status: 404 });
	}

	return Response.json(
		{
			client_id: clientMetadataUrl(plugin),
			client_name: "Superset",
			client_uri: "https://superset.sh",
			redirect_uris: [redirectUri(plugin)],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
			application_type: "web",
		},
		{
			headers: {
				"cache-control": "public, max-age=3600",
				"content-type": "application/json",
			},
		},
	);
}
