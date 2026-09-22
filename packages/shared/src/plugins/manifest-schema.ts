// biome-ignore-all lint/suspicious/noTemplateCurlyInString: ${inputs.*} and ${config.*} are the manifest placeholder syntax this schema documents
import { z } from "zod";
import { PLUGIN_CATEGORIES } from "./index";

const NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

export const pluginConnectorRefSchema = z
	.object({
		slug: z
			.string()
			.describe(
				"A connector in the Superset registry. The connections system owns how the connection is obtained; a manifest only names which one it needs.",
			),
	})
	.meta({ id: "PluginConnectorRef" });

const pluginBindSchema = z
	.object({
		headers: z.record(z.string(), z.string()).optional(),
		env: z.record(z.string(), z.string()).optional(),
	})
	.describe(
		"How the connection's credential reaches the server. ${config.access_token} is substituted by the credential proxy at call time.",
	);

const pluginMcpSchema = z
	.object({
		type: z.literal("streamable-http"),
		url: z.url(),
		headers: z.record(z.string(), z.string()).optional(),
	})
	.describe(
		"The vendor's own MCP server, which Superset dials with the connection's credential attached. Omit it when Superset hosts the plugin's tools itself — absence is the declaration, not a gap. Agents never receive this URL; they are pointed at the Superset endpoint that fronts it. Streamable HTTP only — the legacy HTTP+SSE transport is not supported.",
	);

export const supersetExtensionSchema = z
	.object({
		interface: z
			.object({
				displayName: z.string(),
				category: z.enum(PLUGIN_CATEGORIES).optional(),
				icon: z.string().optional(),
			})
			.optional(),
		connector: pluginConnectorRefSchema
			.optional()
			.describe(
				"The one connection this plugin needs, by connector slug. Its credential is what a tool call runs under. A manifest carries no OAuth configuration of its own — no scopes, no client mode, no requires_env.",
			),
		bind: pluginBindSchema.optional(),
		mcp: pluginMcpSchema.optional(),
	})
	.meta({ id: "SupersetExtension" });

export const pluginManifestSchema = z
	.object({
		$schema: z.string().optional(),
		name: z
			.string()
			.regex(
				NAME_PATTERN,
				"lowercase letters, digits, dots and dashes; no leading, trailing or doubled separators",
			),
		version: z.string(),
		description: z.string().optional(),
		author: z
			.object({ name: z.string().optional(), url: z.url().optional() })
			.optional(),
		homepage: z.url().optional(),
		repository: z.string().optional(),
		license: z.string().optional(),
		keywords: z.array(z.string()).optional(),
		extensions: z.object({ superset: supersetExtensionSchema }).optional(),
	})
	.meta({
		id: "PluginManifest",
		title: "Superset plugin manifest",
		description:
			"plugin.json for a Superset marketplace plugin. Authoring guide: https://docs.superset.sh",
	});

export type PluginManifestInput = z.input<typeof pluginManifestSchema>;
