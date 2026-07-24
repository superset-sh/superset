const API_URL = "https://api.superset.sh";
const MARKETING_URL = "https://superset.sh";
const DOCS_URL = "https://docs.superset.sh";

const ERROR_SCHEMA = {
	type: "object",
	description: "Structured JSON error envelope returned by all API errors.",
	properties: {
		error: {
			type: "object",
			properties: {
				code: {
					type: "string",
					description: "Stable machine-readable error code.",
					examples: ["UNAUTHORIZED", "NOT_FOUND"],
				},
				message: {
					type: "string",
					description: "Human-readable description of the failure.",
				},
				hint: {
					type: "string",
					description: "How to resolve the error, when known.",
				},
			},
			required: ["code", "message"],
		},
	},
	required: ["error"],
} as const;

const JSON_RPC_REQUEST_SCHEMA = {
	type: "object",
	description:
		"A JSON-RPC 2.0 request as defined by the Model Context Protocol.",
	properties: {
		jsonrpc: { type: "string", const: "2.0" },
		id: {
			oneOf: [{ type: "string" }, { type: "number" }],
			description: "Request id. Omitted for notifications.",
		},
		method: {
			type: "string",
			description: "MCP method, e.g. initialize, tools/list, tools/call.",
			examples: ["initialize", "tools/list", "tools/call"],
		},
		params: {
			type: "object",
			description: "Method parameters. For tools/call: { name, arguments }.",
			additionalProperties: true,
		},
	},
	required: ["jsonrpc", "method"],
} as const;

const JSON_RPC_RESPONSE_SCHEMA = {
	type: "object",
	description: "A JSON-RPC 2.0 response from the MCP server.",
	properties: {
		jsonrpc: { type: "string", const: "2.0" },
		id: { oneOf: [{ type: "string" }, { type: "number" }] },
		result: { type: "object", additionalProperties: true },
		error: {
			type: "object",
			properties: {
				code: { type: "integer" },
				message: { type: "string" },
				data: {},
			},
			required: ["code", "message"],
		},
	},
	required: ["jsonrpc"],
} as const;

const UNAUTHORIZED_RESPONSE = {
	description:
		"Missing, expired, or revoked credential. The WWW-Authenticate header points at the RFC 9728 protected resource metadata to bootstrap OAuth discovery.",
	headers: {
		"WWW-Authenticate": {
			schema: { type: "string" },
			description: `Bearer realm="superset", resource_metadata="${API_URL}/.well-known/oauth-protected-resource"`,
		},
	},
	content: {
		"application/json": { schema: { $ref: "#/components/schemas/Error" } },
	},
} as const;

const SPEC = {
	openapi: "3.1.0",
	info: {
		title: "Superset API",
		version: "1.0.0",
		summary: "Programmatic access to Superset's agent-orchestration platform.",
		description: [
			"Superset (https://superset.sh) runs parallel AI coding agents in isolated Git worktrees.",
			"",
			"The primary programmatic surface is the **MCP server** (Model Context Protocol, JSON-RPC 2.0 over Streamable HTTP) at `/api/v2/agent/mcp`. It exposes tools for tasks, workspaces, coding-agent sessions, terminals, automations, hosts, projects, and organization members. The tool catalog with input schemas is published at `" +
				`${API_URL}/.well-known/mcp/server-card.json` +
				"` and served live via the MCP `tools/list` method.",
			"",
			`Authentication is OAuth 2.1 authorization code + PKCE with RFC 7591 dynamic client registration, or a user-issued Superset API key sent as a Bearer token. Agent walkthrough: ${MARKETING_URL}/auth.md`,
		].join("\n"),
		contact: {
			name: "Superset support",
			email: "support@superset.sh",
			url: `${MARKETING_URL}/contact`,
		},
		termsOfService: `${MARKETING_URL}/terms`,
	},
	externalDocs: {
		description: "Superset MCP documentation",
		url: `${DOCS_URL}/mcp-server`,
	},
	servers: [{ url: API_URL, description: "Production" }],
	tags: [
		{ name: "mcp", description: "Model Context Protocol server" },
		{ name: "oauth", description: "OAuth 2.1 / OpenID Connect endpoints" },
		{ name: "discovery", description: "Machine-readable metadata" },
	],
	security: [{ bearerAuth: [] }],
	paths: {
		"/api/v2/agent/mcp": {
			post: {
				operationId: "mcpRequest",
				tags: ["mcp"],
				summary: "Send an MCP JSON-RPC request",
				description:
					"Streamable HTTP transport endpoint for the Superset MCP server. Send `initialize`, then `tools/list` to enumerate the available tools, then `tools/call` to act on the authenticated user's tasks, workspaces, agents, automations, terminals, hosts, and projects. Responses are `application/json` or `text/event-stream` depending on the request's Accept header.",
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: { $ref: "#/components/schemas/JsonRpcRequest" },
						},
					},
				},
				responses: {
					"200": {
						description: "JSON-RPC response (or SSE stream of responses).",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/JsonRpcResponse" },
							},
							"text/event-stream": {
								schema: {
									type: "string",
									description:
										"Server-sent events, each carrying a JSON-RPC response.",
								},
							},
						},
					},
					"401": { $ref: "#/components/responses/Unauthorized" },
				},
			},
			get: {
				operationId: "mcpOpenStream",
				tags: ["mcp"],
				summary: "Open an MCP server-to-client event stream",
				description:
					"Opens the optional Streamable HTTP GET channel for server-initiated MCP messages on an existing session.",
				parameters: [
					{
						name: "Mcp-Session-Id",
						in: "header",
						required: false,
						schema: { type: "string" },
						description: "MCP session id returned by the initialize request.",
					},
				],
				responses: {
					"200": {
						description: "Server-sent event stream.",
						content: { "text/event-stream": { schema: { type: "string" } } },
					},
					"401": { $ref: "#/components/responses/Unauthorized" },
				},
			},
			delete: {
				operationId: "mcpEndSession",
				tags: ["mcp"],
				summary: "Terminate an MCP session",
				parameters: [
					{
						name: "Mcp-Session-Id",
						in: "header",
						required: true,
						schema: { type: "string" },
					},
				],
				responses: {
					"200": { description: "Session terminated." },
					"401": { $ref: "#/components/responses/Unauthorized" },
				},
			},
		},
		"/api/auth/oauth2/register": {
			post: {
				operationId: "oauthRegisterClient",
				tags: ["oauth"],
				summary: "Dynamically register an OAuth client (RFC 7591)",
				description:
					"Anonymous dynamic client registration. Public clients using PKCE should set token_endpoint_auth_method to none.",
				security: [],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								$ref: "#/components/schemas/ClientRegistrationRequest",
							},
						},
					},
				},
				responses: {
					"201": {
						description: "Registered client metadata including client_id.",
						content: {
							"application/json": {
								schema: {
									$ref: "#/components/schemas/ClientRegistrationResponse",
								},
							},
						},
					},
					"400": {
						description: "Invalid client metadata.",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/Error" },
							},
						},
					},
				},
			},
		},
		"/api/auth/oauth2/authorize": {
			get: {
				operationId: "oauthAuthorize",
				tags: ["oauth"],
				summary: "Authorization endpoint (user consent)",
				description:
					"Browser endpoint where the user approves an agent's access. Use the authorization code + PKCE flow.",
				security: [],
				parameters: [
					{
						name: "response_type",
						in: "query",
						required: true,
						schema: { type: "string", enum: ["code"] },
					},
					{
						name: "client_id",
						in: "query",
						required: true,
						schema: { type: "string" },
					},
					{
						name: "redirect_uri",
						in: "query",
						required: true,
						schema: { type: "string", format: "uri" },
					},
					{
						name: "scope",
						in: "query",
						required: false,
						schema: {
							type: "string",
							examples: ["openid profile email offline_access"],
						},
					},
					{
						name: "state",
						in: "query",
						required: false,
						schema: { type: "string" },
					},
					{
						name: "code_challenge",
						in: "query",
						required: true,
						schema: { type: "string" },
					},
					{
						name: "code_challenge_method",
						in: "query",
						required: true,
						schema: { type: "string", enum: ["S256"] },
					},
				],
				responses: {
					"302": {
						description:
							"Redirect to the consent UI, then to redirect_uri with ?code=...&state=...",
					},
				},
			},
		},
		"/api/auth/oauth2/token": {
			post: {
				operationId: "oauthToken",
				tags: ["oauth"],
				summary: "Token endpoint",
				description:
					"Exchange an authorization code (with PKCE code_verifier) or a refresh token for an access token.",
				security: [],
				requestBody: {
					required: true,
					content: {
						"application/x-www-form-urlencoded": {
							schema: { $ref: "#/components/schemas/TokenRequest" },
						},
					},
				},
				responses: {
					"200": {
						description: "Standard OAuth token envelope.",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/TokenResponse" },
							},
						},
					},
					"400": {
						description:
							"OAuth error envelope (invalid_grant, invalid_client, ...).",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/OAuthError" },
							},
						},
					},
				},
			},
		},
		"/api/auth/oauth2/userinfo": {
			get: {
				operationId: "oauthUserinfo",
				tags: ["oauth"],
				summary: "OpenID Connect userinfo",
				responses: {
					"200": {
						description: "Claims about the authenticated user.",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										sub: { type: "string" },
										email: { type: "string", format: "email" },
										email_verified: { type: "boolean" },
										name: { type: "string" },
										picture: { type: "string", format: "uri" },
									},
									required: ["sub"],
								},
							},
						},
					},
					"401": { $ref: "#/components/responses/Unauthorized" },
				},
			},
		},
		"/api/auth/oauth2/revoke": {
			post: {
				operationId: "oauthRevoke",
				tags: ["oauth"],
				summary: "Revoke a token (RFC 7009)",
				security: [],
				requestBody: {
					required: true,
					content: {
						"application/x-www-form-urlencoded": {
							schema: {
								type: "object",
								properties: {
									token: { type: "string" },
									token_type_hint: {
										type: "string",
										enum: ["access_token", "refresh_token"],
									},
									client_id: { type: "string" },
								},
								required: ["token"],
							},
						},
					},
				},
				responses: {
					"200": { description: "Token revoked (idempotent)." },
				},
			},
		},
		"/.well-known/oauth-protected-resource": {
			get: {
				operationId: "getProtectedResourceMetadata",
				tags: ["discovery"],
				summary: "Protected resource metadata (RFC 9728)",
				security: [],
				responses: {
					"200": {
						description:
							"Resource metadata naming the authorization server and supported scopes.",
						content: {
							"application/json": {
								schema: { type: "object", additionalProperties: true },
							},
						},
					},
				},
			},
		},
		"/.well-known/oauth-authorization-server": {
			get: {
				operationId: "getAuthorizationServerMetadata",
				tags: ["discovery"],
				summary: "Authorization server metadata (RFC 8414)",
				description:
					"Includes an agent_auth block (per the auth.md convention) with the registration and revocation URIs agents should use.",
				security: [],
				responses: {
					"200": {
						description: "Authorization server metadata.",
						content: {
							"application/json": {
								schema: { type: "object", additionalProperties: true },
							},
						},
					},
				},
			},
		},
		"/.well-known/mcp/server-card.json": {
			get: {
				operationId: "getMcpServerCard",
				tags: ["discovery"],
				summary: "MCP server card",
				description:
					"Name, description, version, serverUrl, transport, authentication, and the full tool catalog of the Superset MCP server.",
				security: [],
				responses: {
					"200": {
						description: "MCP server card.",
						content: {
							"application/json": {
								schema: { type: "object", additionalProperties: true },
							},
						},
					},
				},
			},
		},
		"/openapi.json": {
			get: {
				operationId: "getOpenApiSpec",
				tags: ["discovery"],
				summary: "This document",
				security: [],
				responses: {
					"200": {
						description: "OpenAPI 3.1 specification.",
						content: {
							"application/json": {
								schema: { type: "object", additionalProperties: true },
							},
						},
					},
				},
			},
		},
	},
	components: {
		securitySchemes: {
			bearerAuth: {
				type: "http",
				scheme: "bearer",
				description:
					"Superset API key or OAuth 2.1 access token. Unauthenticated requests receive 401 with a WWW-Authenticate header pointing at the protected resource metadata.",
			},
			oauth2: {
				type: "oauth2",
				description:
					"OAuth 2.1 authorization code + PKCE with RFC 7591 dynamic client registration.",
				flows: {
					authorizationCode: {
						authorizationUrl: `${API_URL}/api/auth/oauth2/authorize`,
						tokenUrl: `${API_URL}/api/auth/oauth2/token`,
						refreshUrl: `${API_URL}/api/auth/oauth2/token`,
						scopes: {
							openid: "OpenID Connect identity",
							profile: "User profile",
							email: "User email",
							offline_access: "Refresh tokens",
						},
					},
				},
			},
		},
		schemas: {
			Error: ERROR_SCHEMA,
			JsonRpcRequest: JSON_RPC_REQUEST_SCHEMA,
			JsonRpcResponse: JSON_RPC_RESPONSE_SCHEMA,
			OAuthError: {
				type: "object",
				properties: {
					error: {
						type: "string",
						examples: ["invalid_grant", "invalid_client", "invalid_request"],
					},
					error_description: { type: "string" },
				},
				required: ["error"],
			},
			ClientRegistrationRequest: {
				type: "object",
				properties: {
					client_name: { type: "string" },
					redirect_uris: {
						type: "array",
						items: { type: "string", format: "uri" },
					},
					grant_types: {
						type: "array",
						items: {
							type: "string",
							enum: ["authorization_code", "refresh_token"],
						},
					},
					token_endpoint_auth_method: {
						type: "string",
						enum: ["none", "client_secret_basic", "client_secret_post"],
					},
					scope: { type: "string" },
				},
				required: ["redirect_uris"],
			},
			ClientRegistrationResponse: {
				type: "object",
				properties: {
					client_id: { type: "string" },
					client_secret: { type: "string" },
					client_name: { type: "string" },
					redirect_uris: {
						type: "array",
						items: { type: "string", format: "uri" },
					},
					grant_types: { type: "array", items: { type: "string" } },
					token_endpoint_auth_method: { type: "string" },
				},
				required: ["client_id"],
			},
			TokenRequest: {
				type: "object",
				properties: {
					grant_type: {
						type: "string",
						enum: ["authorization_code", "refresh_token", "client_credentials"],
					},
					code: { type: "string" },
					redirect_uri: { type: "string", format: "uri" },
					client_id: { type: "string" },
					code_verifier: { type: "string" },
					refresh_token: { type: "string" },
				},
				required: ["grant_type"],
			},
			TokenResponse: {
				type: "object",
				properties: {
					access_token: { type: "string" },
					token_type: { type: "string", examples: ["Bearer"] },
					expires_in: {
						type: "integer",
						description: "Access token lifetime in seconds (3600).",
					},
					refresh_token: { type: "string" },
					scope: { type: "string" },
					id_token: { type: "string" },
				},
				required: ["access_token", "token_type"],
			},
		},
		responses: {
			Unauthorized: UNAUTHORIZED_RESPONSE,
		},
	},
} as const;

export function GET() {
	return Response.json(SPEC, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
