import { COMPANY } from "@superset/shared/constants";
import { AGENT_DID } from "@/lib/agent-identity";
import { API_URL, MCP_SERVER_URL } from "@/lib/llms";
import { SKILL_NAMES } from "../agent-skills/skills-source";

const TRUST = { identity: AGENT_DID, identityType: "did" } as const;

// Agentic Resource Discovery catalog (https://agenticresourcediscovery.org).
// One document listing every agent-invokable resource Superset publishes.
export function GET() {
	const baseUrl = COMPANY.MARKETING_URL;
	const docsUrl = COMPANY.DOCS_URL;
	const urn = (kind: string, name: string) =>
		`urn:air:${COMPANY.DOMAIN}:${kind}:${name}`;

	const entries = [
		{
			identifier: urn("mcp", "superset"),
			displayName: "Superset MCP server",
			type: "application/mcp-server-card+json",
			url: `${baseUrl}/.well-known/mcp/server-card.json`,
			description:
				"Create Git-worktree workspaces, launch coding-agent sessions, open terminals, schedule automations, and manage tasks on behalf of a Superset user. OAuth 2.1 + PKCE or API key.",
			tags: [
				"coding-agents",
				"workspaces",
				"orchestration",
				"automations",
				"mcp",
			],
			capabilities: [
				"tasks",
				"workspaces",
				"agents",
				"terminals",
				"automations",
				"projects",
				"hosts",
				"organization",
			],
			representativeQueries: [
				"create a workspace on a new branch and start Claude Code on it",
				"list my open Superset tasks",
				"schedule a nightly agent run that audits the repo",
				"show what my coding agents are doing right now",
			],
			trustManifest: TRUST,
		},
		{
			identifier: urn("mcp", "docs"),
			displayName: "Superset docs MCP server",
			type: "application/mcp-server-card+json",
			url: `${docsUrl}/.well-known/mcp/server-card.json`,
			description:
				"Read-only search and retrieval over the Superset documentation. No authentication.",
			tags: ["documentation", "search", "mcp"],
			capabilities: ["docs_search", "docs_read"],
			representativeQueries: [
				"how do I install the Superset CLI",
				"what does a Superset automation do",
			],
			trustManifest: TRUST,
		},
		{
			identifier: urn("agent", "superset"),
			displayName: "Superset agent card (A2A)",
			type: "application/a2a-agent-card+json",
			url: `${baseUrl}/.well-known/agent-card.json`,
			description:
				"A2A-style capability card for the Superset orchestration service. Skills: workspaces, agents, tasks, automations, terminals.",
			tags: ["a2a", "orchestration", "coding-agents"],
			trustManifest: TRUST,
		},
		{
			identifier: urn("api", "superset"),
			displayName: "Superset API",
			type: "application/vnd.oai.openapi+json;version=3.1",
			url: `${API_URL}/openapi.json`,
			description:
				"OpenAPI 3.1 description of the Superset HTTP surface: the MCP endpoint, OAuth 2.1 endpoints, and discovery metadata.",
			tags: ["api", "openapi", "oauth"],
			trustManifest: TRUST,
		},
		...SKILL_NAMES.map((name) => ({
			identifier: urn("skill", name),
			displayName: name,
			type: "application/ai-skill+md",
			url: `${baseUrl}/.well-known/agent-skills/${name}/SKILL.md`,
			description: `Agent skill: ${name.replace(/^superset-/, "")} with the Superset CLI and MCP server.`,
			tags: ["skill", "superset"],
			trustManifest: TRUST,
		})),
	];

	const catalog = {
		specVersion: "1.0",
		host: {
			displayName: COMPANY.NAME,
			identifier: AGENT_DID,
			url: baseUrl,
			documentationUrl: `${docsUrl}/mcp-server`,
			mcpServerUrl: MCP_SERVER_URL,
		},
		entries,
	};

	return Response.json(catalog, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
