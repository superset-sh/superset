import { API_URL, MARKDOWN_HEADERS, MCP_SERVER_URL } from "@/lib/llms";

export async function GET() {
	const content = `# Superset agent authentication

How an AI agent obtains and uses credentials for the Superset API (${API_URL}). The flow is standard OAuth 2.1 with PKCE plus RFC 7591 dynamic client registration; no manual app setup is required. This document follows the auth.md convention (https://workos.com/auth-md).

## 1. Discover

Make an unauthenticated request to the MCP endpoint:

\`\`\`
POST ${MCP_SERVER_URL}
\`\`\`

The response is \`401\` with a spec-shaped header:

\`\`\`
WWW-Authenticate: Bearer realm="superset", resource_metadata="${API_URL}/.well-known/oauth-protected-resource"
\`\`\`

Fetch the protected resource metadata (RFC 9728), read \`authorization_servers\`, then fetch the authorization server metadata (RFC 8414) at \`${API_URL}/.well-known/oauth-authorization-server\`. Read the \`agent_auth\` block there for the registration and revocation URIs.

## 2. Pick a method

- **OAuth 2.1 (recommended)**: authorization code + PKCE with dynamic client registration. The user approves your agent in a browser; you get a scoped, revocable access token and a refresh token.
- **API key**: a user can create an API key in the Superset app and hand it to your agent. Send it as a Bearer token. Skip to "Use the credential".

Identity assertions (\`identity_assertion\`, \`urn:ietf:params:oauth:token-type:id-jag\`) are not yet supported; registration is anonymous until the user claims it via the browser consent step below.

## 3. Register

Register a client (RFC 7591) at the \`register_uri\` from the \`agent_auth\` block:

\`\`\`
POST ${API_URL}/api/auth/oauth2/register
Content-Type: application/json

{
  "client_name": "<your agent name>",
  "redirect_uris": ["<your callback URL>"],
  "grant_types": ["authorization_code", "refresh_token"],
  "token_endpoint_auth_method": "none"
}
\`\`\`

The response contains your \`client_id\`. Public clients (no secret) with PKCE are supported.

## 4. Claim

Send the user to the authorization endpoint to claim the registration — this is the human-approval step:

\`\`\`
GET ${API_URL}/api/auth/oauth2/authorize?client_id=...&response_type=code&redirect_uri=...&scope=openid+profile+email+offline_access&code_challenge=...&code_challenge_method=S256
\`\`\`

After consent, exchange the returned code at the token endpoint:

\`\`\`
POST ${API_URL}/api/auth/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=...&redirect_uri=...&client_id=...&code_verifier=...
\`\`\`

The response is a standard OAuth envelope: \`access_token\`, \`token_type\`, \`expires_in\`, and (with \`offline_access\`) a \`refresh_token\`.

## 5. Use the credential

Send the token on every MCP request:

\`\`\`
POST ${MCP_SERVER_URL}
Authorization: Bearer <access_token>
\`\`\`

Access tokens expire after one hour; refresh with \`grant_type=refresh_token\` at the token endpoint. Tokens are scoped to the user who approved the claim and to their active organization.

## 6. Errors

All errors are JSON. The ones you will see:

- \`401\` \`{"error": {"code": "UNAUTHORIZED", "message": "..."}}\` — missing, expired, or revoked token. Re-read \`WWW-Authenticate\` and re-authenticate.
- \`invalid_grant\` from the token endpoint — the refresh token was revoked or the code expired; restart at "Claim".
- \`invalid_client\` — the registration is unknown; restart at "Register".

## 7. Revocation

Revoke a credential at the revocation endpoint (RFC 7009):

\`\`\`
POST ${API_URL}/api/auth/oauth2/revoke
Content-Type: application/x-www-form-urlencoded

token=<access_or_refresh_token>&client_id=...
\`\`\`

Users can also revoke your agent's access and API keys at any time from the Superset app; revoked tokens fail with \`401\` on the next request.
`;

	return new Response(content, { headers: MARKDOWN_HEADERS });
}
