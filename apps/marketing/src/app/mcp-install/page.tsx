import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { GridCross } from "@/app/blog/components/GridCross";
import { MCP_SERVER_URL } from "@/lib/api-url";
import { McpCapabilities } from "./components/McpCapabilities";
import { McpExamples } from "./components/McpExamples";
import { McpInstall } from "./components/McpInstall";

export const metadata: Metadata = {
	title: "MCP Server",
	description: `Connect Claude, Codex, Cursor, or any MCP client to ${COMPANY.NAME}. Create tasks, spin up workspaces, launch agents, and run automations straight from your AI agent.`,
	alternates: {
		canonical: `${COMPANY.MARKETING_URL}/mcp-install`,
	},
};

export default function McpPage() {
	return (
		<main className="relative min-h-screen">
			{/* Header + Install section */}
			<header className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 pt-16 pb-12 md:pt-20 md:pb-16 relative">
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />

					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						MCP Server
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						Install Superset MCP in your client
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						Connect Claude, Codex, Cursor, or any{" "}
						<a
							href="https://modelcontextprotocol.io"
							target="_blank"
							rel="noopener noreferrer"
							className="text-brand hover:text-brand-light transition-colors"
						>
							MCP
						</a>{" "}
						client and let your agent create tasks, spin up workspaces, launch
						agents, and run automations on your behalf.
					</p>
					<p className="mt-6 inline-flex items-center gap-2 text-xs font-mono text-muted-foreground border border-border rounded-[2px] px-3 py-1.5 bg-foreground/[0.03]">
						{MCP_SERVER_URL}
					</p>

					<div className="mt-8">
						<McpInstall />
						<p className="text-sm text-muted-foreground mt-4">
							Pick your agent for a one-line install, or copy the config by
							hand. Every client, including OAuth and API key setup, is covered
							in the{" "}
							<a
								href={`${COMPANY.DOCS_URL}/mcp-server`}
								className="text-brand hover:text-brand-light transition-colors"
							>
								full MCP server docs
							</a>
							.
						</p>
					</div>

					<GridCross className="bottom-0 left-0" />
					<GridCross className="bottom-0 right-0" />
				</div>
			</header>

			{/* Capabilities */}
			<section className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						Capabilities
					</span>
					<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground mt-4 mb-8">
						What your agent can do
					</h2>
					<McpCapabilities />
					<p className="text-sm text-muted-foreground mt-10">
						See the{" "}
						<a
							href={`${COMPANY.DOCS_URL}/mcp-server#available-tools`}
							className="text-brand hover:text-brand-light transition-colors"
						>
							available tools reference
						</a>{" "}
						for every tool name and parameter.
					</p>
				</div>
			</section>

			{/* Example usage */}
			<section className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						Try it
					</span>
					<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground mt-4 mb-8">
						Just ask
					</h2>
					<McpExamples />
				</div>
			</section>

			{/* Authentication */}
			<section className="relative">
				<div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						Authentication
					</span>
					<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground mt-4 mb-3">
						OAuth by default, API keys for CI
					</h2>
					<p className="text-muted-foreground max-w-lg">
						Interactive clients authorize over OAuth 2.1 in your browser, scoped
						to your active organization. For headless environments and CI,
						generate an API key from Settings → API Keys in the desktop app and
						pass it as a Bearer token instead. Full setup, including header
						config for Claude Code, is in the{" "}
						<a
							href={`${COMPANY.DOCS_URL}/mcp-server#authentication`}
							className="text-brand hover:text-brand-light transition-colors"
						>
							authentication docs
						</a>
						.
					</p>
				</div>
			</section>
		</main>
	);
}
