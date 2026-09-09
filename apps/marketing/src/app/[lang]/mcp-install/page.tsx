import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import type { Metadata } from "next";
import { GridCross } from "@/app/[lang]/blog/components/GridCross";
import { localizedAlternates } from "@/app/[lang]/metadata";
import { initServerI18n } from "@/app/i18n-server";
import { MCP_SERVER_URL } from "@/lib/api-url";
import { McpCapabilities } from "./components/McpCapabilities";
import { McpExamples } from "./components/McpExamples";
import { McpInstall } from "./components/McpInstall";

export async function generateMetadata(): Promise<Metadata> {
	const lang = await initServerI18n();
	return {
		title: i18n._(
			msg({
				message: "MCP Server",
			}),
		),
		description: i18n._({
			...msg({
				message:
					"Connect Claude, Codex, Cursor, or any MCP client to {companyName}. Create tasks, spin up workspaces, launch agents, and run automations straight from your AI agent.",
			}),
			values: { companyName: COMPANY.NAME },
		}),
		alternates: localizedAlternates(lang, "/mcp-install"),
	};
}

export default async function McpPage() {
	await initServerI18n();

	return (
		<main className="relative min-h-screen">
			{/* Header + Install section */}
			<header className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 pt-16 pb-12 md:pt-20 md:pb-16 relative">
					<GridCross className="top-0 left-0" />
					<GridCross className="top-0 right-0" />

					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						<Trans>MCP Server</Trans>
					</span>
					<h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mt-4">
						<Trans>Install Superset MCP in your client</Trans>
					</h1>
					<p className="text-muted-foreground mt-3 max-w-lg">
						<Trans>
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
						</Trans>
					</p>
					<p className="mt-6 inline-flex items-center gap-2 text-xs font-mono text-muted-foreground border border-border rounded-[2px] px-3 py-1.5 bg-foreground/[0.03]">
						{MCP_SERVER_URL}
					</p>

					<div className="mt-8">
						<McpInstall />
						<p className="text-sm text-muted-foreground mt-4">
							<Trans>
								Pick your agent for a one-line install, or copy the config by
								hand. Every client, including OAuth and API key setup, is
								covered in the{" "}
								<a
									href={`${COMPANY.DOCS_URL}/mcp-server`}
									className="text-brand hover:text-brand-light transition-colors"
								>
									full MCP server docs
								</a>
								.
							</Trans>
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
						<Trans>Capabilities</Trans>
					</span>
					<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground mt-4 mb-8">
						<Trans>What your agent can do</Trans>
					</h2>
					<McpCapabilities />
					<p className="text-sm text-muted-foreground mt-10">
						<Trans>
							See the{" "}
							<a
								href={`${COMPANY.DOCS_URL}/mcp-server#available-tools`}
								className="text-brand hover:text-brand-light transition-colors"
							>
								available tools reference
							</a>{" "}
							for every tool name and parameter.
						</Trans>
					</p>
				</div>
			</section>

			{/* Example usage */}
			<section className="relative border-b border-border">
				<div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						<Trans>Try it</Trans>
					</span>
					<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground mt-4 mb-8">
						<Trans>Just ask</Trans>
					</h2>
					<McpExamples />
				</div>
			</section>

			{/* Authentication */}
			<section className="relative">
				<div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
					<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
						<Trans>Authentication</Trans>
					</span>
					<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground mt-4 mb-3">
						<Trans>OAuth by default, API keys for CI</Trans>
					</h2>
					<p className="text-muted-foreground max-w-lg">
						<Trans>
							Interactive clients authorize over OAuth 2.1 in your browser,
							scoped to your active organization. For headless environments and
							CI, generate an API key from Settings → API Keys in the desktop
							app and pass it as a Bearer token instead. Full setup, including
							header config for Claude Code, is in the{" "}
							<a
								href={`${COMPANY.DOCS_URL}/mcp-server#authentication`}
								className="text-brand hover:text-brand-light transition-colors"
							>
								authentication docs
							</a>
							.
						</Trans>
					</p>
				</div>
			</section>
		</main>
	);
}
