import fs from "node:fs";
import path from "node:path";
import { CLIError } from "@superset/cli-framework";
import {
	type MarketplaceContext,
	SUPERSET_EXTENSION,
	suggestedEnvFor,
	writeJson,
} from "./marketplace";

export type PluginKind = "url" | "server" | "none";

export interface ScaffoldOptions {
	name: string;
	kind: PluginKind;
	url?: string;
	displayName?: string;
	description?: string;
	category?: string;
	skills: boolean;
	auth: boolean;
}

const NAME_PATTERN = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

function titleCase(name: string): string {
	return name
		.split(/[-.]/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function write(file: string, contents: string): void {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, contents);
}

function skillTemplate(pluginName: string, display: string): string {
	return `---
name: ${pluginName}-workflow
description: Describe exactly when an agent should reach for this skill, in the words a user would actually say. Replace this before publishing — the description is the only thing an agent sees when deciding whether to load the skill.
---

# ${display} workflow

Replace this with the workflow an agent should follow. A good skill encodes
judgment the tools do not: what order to do things in, what to check before
acting, and what to do when the obvious answer is wrong.

## Steps

1. State what to gather first, and why that ordering matters.
2. State the decision the agent has to make, and the rule for making it.
3. State how to report the result.

## Anti-patterns

- List what people get wrong here, so the agent can avoid it.
`;
}

function serverIndex(): string {
	return `import { callTool, getTools } from "./tools";
import { type PluginEvent, PluginEventType, type PluginResult } from "./types";

export async function run(event: PluginEvent): Promise<PluginResult> {
	switch (event.event) {
		case PluginEventType.GET_TOOLS:
			return getTools();

		case PluginEventType.CALL_TOOL:
			return await callTool(
				event.eventBody.name,
				event.eventBody.arguments ?? {},
				event.config?.access_token,
			);

		default:
			return { message: \`Unhandled event: \${(event as PluginEvent).event}\` };
	}
}
`;
}

function serverTools(name: string, auth: boolean): string {
	const guard = auth
		? `	if (!accessToken) {
		return {
			content: [
				{ type: "text", text: "Not connected; connect the plugin first." },
			],
			isError: true,
		};
	}

`
		: "";
	return `${serverToolsHeader(name)}export async function callTool(
	name: string,
	args: Record<string, unknown>,
	accessToken${auth ? "" : "?"}: string,
): Promise<ToolResult> {
${guard}	switch (name) {
		case "${name.replace(/[.-]/g, "_")}_example":
			return {
				content: [{ type: "text", text: JSON.stringify(args, null, 2) }],
			};

		default:
			return {
				content: [{ type: "text", text: \`Unknown tool: \${name}\` }],
				isError: true,
			};
	}
}
`;
}

function serverToolsHeader(name: string): string {
	return `import type { ToolDefinition, ToolResult } from "./types";

export function getTools(): ToolDefinition[] {
	return [
		{
			name: "${name.replace(/[.-]/g, "_")}_example",
			description: "Replace this with a real tool.",
			inputSchema: {
				type: "object",
				properties: {
					query: { type: "string", description: "What to look up" },
				},
				required: ["query"],
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
			},
		},
	];
}

`;
}

const SERVER_TYPES = `export const PluginEventType = {
	SYNC: "sync",
	GET_TOOLS: "get-tools",
	CALL_TOOL: "call-tool",
} as const;

export interface PluginConfig {
	access_token: string;
	[key: string]: unknown;
}

export interface ToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	annotations?: {
		readOnlyHint?: boolean;
		destructiveHint?: boolean;
		idempotentHint?: boolean;
	};
}

export interface ToolResult {
	content: Array<{ type: "text"; text: string }>;
	isError?: boolean;
}

export type PluginEvent =
	| { event: "sync"; eventBody: Record<string, unknown>; config: PluginConfig }
	| {
			event: "get-tools";
			eventBody: Record<string, unknown>;
			config: PluginConfig;
	  }
	| {
			event: "call-tool";
			eventBody: { name: string; arguments: Record<string, unknown> };
			config: PluginConfig;
	  };

export type PluginResult =
	| ToolDefinition[]
	| ToolResult
	| { message: string }
	| Record<string, unknown>;
`;

const TSCONFIG = `{
	"compilerOptions": {
		"target": "ES2022",
		"module": "ESNext",
		"moduleResolution": "bundler",
		"lib": ["ES2022", "DOM"],
		"strict": true,
		"noEmit": true,
		"skipLibCheck": true,
		"verbatimModuleSyntax": true
	},
	"include": ["src"]
}
`;

export interface ScaffoldResult {
	dir: string;
	files: string[];
}

export function scaffoldPlugin(
	ctx: MarketplaceContext,
	options: ScaffoldOptions,
): ScaffoldResult {
	const { name, kind } = options;

	if (!NAME_PATTERN.test(name) || name.length > 64) {
		throw new CLIError(
			`"${name}" is not a valid plugin name: lowercase letters, digits, dots and hyphens, no leading or trailing punctuation, no "--" or "..".`,
		);
	}
	if (ctx.marketplace.plugins.some((p) => p.name === name)) {
		throw new CLIError(`"${name}" is already in this marketplace.`);
	}
	if (kind === "url" && !options.url) {
		throw new CLIError("A url-based plugin needs --url.");
	}
	if (kind === "none" && !options.skills) {
		throw new CLIError(
			"A plugin with no server and no skills would do nothing; pass --skills or choose another kind.",
		);
	}

	const dir = path.join(ctx.root, "plugins", name);
	if (fs.existsSync(dir)) {
		throw new CLIError(`${path.relative(ctx.root, dir)} already exists.`);
	}

	fs.mkdirSync(dir, { recursive: true });

	const display = options.displayName ?? titleCase(name);
	const description = options.description ?? `${display} plugin.`;
	const files: string[] = [];
	const add = (relative: string, contents: string) => {
		write(path.join(dir, relative), contents);
		files.push(relative);
	};

	const extension: Record<string, unknown> = {
		interface: {
			displayName: display,
			category: options.category ?? "Developer tools",
			icon: name,
		},
	};

	if (options.auth) {
		const method: Record<string, unknown> = {
			type: "oauth2",
			provider: name,
			authorization_url: `https://example.com/oauth/authorize`,
			token_url: `https://example.com/oauth/token`,
			scopes: ["read"],
			scope_separator: " ",
			token_request_auth_method: "client_secret_post",
			requires_env: suggestedEnvFor(name),
		};
		extension.auth = [method];
		if (kind === "url") {
			extension.bind = {
				// biome-ignore lint/suspicious/noTemplateCurlyInString: the proxy interpolates this at call time; it must stay a literal
				headers: { Authorization: "Bearer ${config.access_token}" },
			};
		}
	}

	if (kind === "url") {
		extension.mcp = { type: "streamable-http", url: options.url };
	}

	const manifest = {
		$schema: "https://superset.sh/schemas/plugin/1.0.0.json",
		name,
		version: "0.1.0",
		description,
		author: { name: ctx.marketplace.owner?.name ?? "Superset" },
		license: "MIT",
		extensions: { [SUPERSET_EXTENSION]: extension },
	};
	writeJson(path.join(dir, "plugin.json"), manifest);
	files.push("plugin.json");

	const pkg: Record<string, unknown> = {
		name: `@superset-plugins/${name}`,
		version: "0.1.0",
		private: true,
		type: "module",
		scripts:
			kind === "server"
				? {
						build: `superset plugins build ${name}`,
						publish: `superset plugins publish ${name}`,
						check: `superset plugins validate plugins/${name}`,
					}
				: {
						publish: `superset plugins publish ${name}`,
						check: `superset plugins validate plugins/${name}`,
					},
	};
	writeJson(path.join(dir, "package.json"), pkg);
	files.push("package.json");

	if (kind === "server") {
		add(path.join("src", "index.ts"), serverIndex());
		add(path.join("src", "tools.ts"), serverTools(name, options.auth));
		add(path.join("src", "types.ts"), SERVER_TYPES);
		add("tsconfig.json", TSCONFIG);
	}

	if (options.skills) {
		add(
			path.join("skills", `${name}-workflow`, "SKILL.md"),
			skillTemplate(name, display),
		);
	}

	ctx.marketplace.plugins.push({
		name,
		description,
		author: { name: ctx.marketplace.owner?.name ?? "Superset" },
		category: (options.category ?? "development").toLowerCase(),
		source: `./plugins/${name}`,
	});
	writeJson(ctx.file, ctx.marketplace);

	return { dir: path.relative(ctx.root, dir), files };
}
