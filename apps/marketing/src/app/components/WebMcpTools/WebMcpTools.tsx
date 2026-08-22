"use client";

import { COMPANY } from "@superset/shared/constants";
import { useEffect } from "react";
import { MCP_SERVER_URL } from "@/lib/api-url";
import { PRODUCT_SUMMARY } from "@/lib/product-facts";

// WebMCP (W3C WICG draft): expose a few read-only tools to browser-resident
// agents. document.modelContext is the current surface; navigator.modelContext
// is the pre-Chrome-150 alias. No-op where neither exists.

interface ModelContextTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	annotations?: { readOnlyHint?: boolean };
	execute: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

interface ModelContext {
	registerTool: (tool: ModelContextTool) => unknown;
	unregisterTool?: (name: string) => unknown;
}

function getModelContext(): ModelContext | undefined {
	const fromDocument = (document as unknown as { modelContext?: ModelContext })
		.modelContext;
	const fromNavigator = (
		navigator as unknown as { modelContext?: ModelContext }
	).modelContext;
	const context = fromDocument ?? fromNavigator;
	return context && typeof context.registerTool === "function"
		? context
		: undefined;
}

const INSTALL_COMMANDS: Record<string, string> = {
	macos: `Download the desktop app from ${COMPANY.MARKETING_URL}/download`,
	cli: "brew install superset-sh/tap/superset (or: curl -fsSL https://superset.sh/cli/install.sh | sh)",
	mcp: `claude mcp add --transport http superset ${MCP_SERVER_URL}`,
};

function buildTools(): ModelContextTool[] {
	const baseUrl = COMPANY.MARKETING_URL;
	return [
		{
			name: "superset_product_facts",
			description:
				"What Superset is, what it costs, which platforms and coding agents it supports, and where the docs and API live.",
			inputSchema: { type: "object", properties: {} },
			annotations: { readOnlyHint: true },
			execute: () => ({
				summary: PRODUCT_SUMMARY,
				docs: COMPANY.DOCS_URL,
				pricing: `${baseUrl}/pricing`,
				download: `${baseUrl}/download`,
				mcpServer: MCP_SERVER_URL,
				agentGuide: `${baseUrl}/agents.md`,
				llmsTxt: `${baseUrl}/llms.txt`,
			}),
		},
		{
			name: "superset_install_command",
			description:
				"The install command for a Superset surface: the macOS desktop app, the CLI, or the MCP server in an MCP client.",
			inputSchema: {
				type: "object",
				properties: {
					surface: {
						type: "string",
						enum: Object.keys(INSTALL_COMMANDS),
						description: "Which surface to install.",
					},
				},
				required: ["surface"],
			},
			annotations: { readOnlyHint: true },
			execute: (args) => {
				const surface = String(args.surface ?? "macos");
				return { surface, command: INSTALL_COMMANDS[surface] ?? null };
			},
		},
		{
			name: "superset_open_page",
			description:
				"Navigate this tab to a Superset page: pricing, docs, download, blog, changelog, compare, or mcp-install.",
			inputSchema: {
				type: "object",
				properties: {
					page: {
						type: "string",
						enum: [
							"pricing",
							"docs",
							"download",
							"blog",
							"changelog",
							"compare",
							"mcp-install",
						],
					},
				},
				required: ["page"],
			},
			execute: (args) => {
				const page = String(args.page ?? "");
				const href = page === "docs" ? COMPANY.DOCS_URL : `${baseUrl}/${page}`;
				window.location.assign(href);
				return { navigatedTo: href };
			},
		},
	];
}

export function WebMcpTools() {
	useEffect(() => {
		const context = getModelContext();
		if (!context) return;
		const tools = buildTools();
		for (const tool of tools) {
			try {
				context.registerTool(tool);
			} catch {
				// Browser rejected the registration; nothing to recover.
			}
		}
		return () => {
			for (const tool of tools) {
				try {
					context.unregisterTool?.(tool.name);
				} catch {
					// Already gone.
				}
			}
		};
	}, []);

	return null;
}
