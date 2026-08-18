import type { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";

type MetadataHandler = ReturnType<typeof oauthProviderAuthServerMetadata>;

/**
 * Wraps better-auth's RFC 8414 metadata handler to append an `agent_auth`
 * block (auth.md convention, https://workos.com/auth-md). Only advertises
 * what we actually implement: anonymous RFC 7591 dynamic client registration
 * claimed by the user via browser consent, and RFC 7009 revocation. Identity
 * assertions (id-jag) are intentionally absent.
 */
export function withAgentAuthMetadata(handler: MetadataHandler) {
	return async (request: Request): Promise<Response> => {
		const response = await handler(request);
		if (!response.ok) {
			return response;
		}

		const metadata = (await response.json()) as Record<string, unknown>;
		const registerUri =
			typeof metadata.registration_endpoint === "string"
				? metadata.registration_endpoint
				: undefined;
		const revocationUri =
			typeof metadata.revocation_endpoint === "string"
				? metadata.revocation_endpoint
				: undefined;

		metadata.agent_auth = {
			skill: "https://superset.sh/auth.md",
			...(registerUri ? { register_uri: registerUri } : {}),
			...(revocationUri ? { revocation_uri: revocationUri } : {}),
			identity_types_supported: ["anonymous"],
			anonymous: {
				credential_types_supported: ["access_token"],
				description:
					"RFC 7591 registration carries no identity; the user claims it via browser consent (authorization code + PKCE).",
			},
		};

		const headers = new Headers(response.headers);
		headers.delete("content-length");
		return Response.json(metadata, { status: response.status, headers });
	};
}
