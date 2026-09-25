import { z } from "zod";
import raw from "./connectors.json";

const identityRef = z.object({
	id: z.string(),
	label: z.string().optional(),
});

const identityPaths = {
	account: identityRef,
	user: identityRef.optional(),
};

const identityProbe = z.union([
	z.object({
		url: z.string(),
		method: z.enum(["GET", "POST"]).default("GET"),
		headers: z.record(z.string(), z.string()).optional(),
		body: z.record(z.string(), z.unknown()).optional(),
		...identityPaths,
	}),
	z.strictObject(identityPaths),
]);

const bindSpec = z.object({
	headers: z.record(z.string(), z.string()).optional(),
	query: z.record(z.string(), z.string()).optional(),
});

const methodInput = z.object({
	name: z.string(),
	label: z.string().optional(),
	placeholder: z.string().optional(),
	description: z.string().optional(),
	required: z.boolean().default(false),
	secret: z.boolean().default(false),
});

const shared = {
	label: z.string().optional(),
	requires_env: z.array(z.string()).default([]),
	scopes: z.array(z.string()).default([]),
	scope_separator: z.string().default(" "),
	token_request_auth_method: z
		.enum(["client_secret_post", "client_secret_basic"])
		.optional(),
	token_expiration_buffer: z.number().optional(),
	identity: identityProbe,
	bind: bindSpec.optional(),
};

const oauth2Method = z.object({
	type: z.literal("oauth2"),
	authorization_url: z.string().optional(),
	token_url: z.string().optional(),
	authorization_params: z.record(z.string(), z.string()).optional(),
	token_params: z.record(z.string(), z.string()).optional(),
	pkce: z.boolean().default(false),
	scope_identifier: z.string().default("scope"),
	client: z.enum(["static", "dynamic"]).default("static"),
	token: z.string().default("$.access_token"),
	store: z.record(z.string(), z.string()).default({}),
	...shared,
});

const apiKeyMethod = z.object({
	type: z.literal("api_key"),
	credential_input: z.string(),
	inputs: z.array(methodInput),
	...shared,
});

const appInstallMethod = z.object({
	type: z.literal("app_install"),
	install_url: z.string(),
	token_url: z.string(),
	callback_params: z.array(z.string()).default([]),
	...shared,
});

const adminConsentMethod = z.object({
	type: z.literal("admin_consent"),
	consent_url: z.string(),
	token_url: z.string(),
	grant_type: z.literal("client_credentials"),
	callback_params: z.array(z.string()).default([]),
	identity_signin: z
		.object({
			authorization_url: z.string(),
			scopes: z.array(z.string()),
			scope_separator: z.string().default(" "),
		})
		.optional(),
	...shared,
});

const connectorMethod = z.discriminatedUnion("type", [
	oauth2Method,
	apiKeyMethod,
	appInstallMethod,
	adminConsentMethod,
]);

const connector = z.object({
	displayName: z.string(),
	icon: z.string(),
	category: z.string(),
	scope: z.enum(["user", "org"]),
	methods: z.array(connectorMethod).min(1),
});

const registry = z.object({
	version: z.string(),
	connectors: z.record(z.string(), connector),
});

export type Connector = z.infer<typeof connector>;
export type ConnectorMethod = z.infer<typeof connectorMethod>;
export type ConnectorMethodType = ConnectorMethod["type"];
export type ConnectorOwnerKind = Connector["scope"];
export type ConnectorIdentityProbe = z.infer<typeof identityProbe>;
export type ConnectorBind = z.infer<typeof bindSpec>;
export type ConnectorSlug = keyof typeof raw.connectors;

const parsed = registry.parse(raw);

export const CONNECTORS: Record<string, Connector> = parsed.connectors;
export const CONNECTOR_SLUGS = Object.keys(CONNECTORS) as ConnectorSlug[];

export const getConnector = (slug: string): Connector | undefined =>
	CONNECTORS[slug];

export const connectorRequiredEnv = (slug: string): string[] => [
	...new Set(getConnector(slug)?.methods.flatMap((m) => m.requires_env) ?? []),
];

export function secretInputNames(method: ConnectorMethod): string[] {
	if (method.type !== "api_key") return [];
	return [
		...new Set([
			...method.inputs
				.filter((input) => input.secret)
				.map((input) => input.name),
			method.credential_input,
		]),
	];
}
