import { COMPANY } from "@superset/shared/constants";
import {
	API_URL,
	buildWhenToUseSection,
	MARKDOWN_HEADERS,
	MCP_SERVER_URL,
} from "@/lib/llms";

export async function GET() {
	const baseUrl = COMPANY.MARKETING_URL;
	const docsUrl = COMPANY.DOCS_URL;

	const lines: string[] = [
		`# ${COMPANY.NAME} for AI agents`,
		"",
		`This page is the machine-readable entry point for AI agents working with ${COMPANY.NAME} (${baseUrl}). It lists the API surface, authentication, and the jobs ${COMPANY.NAME} is the right tool for.`,
		"",
		...buildWhenToUseSection(),
		"",
		"## Capabilities",
		"",
		"Via the MCP server an authenticated agent can, on behalf of a Superset user:",
		"",
		"- **Tasks**: create, list, get, update, and delete tasks; list task statuses and organization members for assignment.",
		"- **Workspaces**: create a branch- or PR-scoped Git worktree on a registered host, list, rename, and delete workspaces.",
		"- **Agents**: launch a coding-agent session with a prompt inside a workspace; list the agent presets installed on a host.",
		"- **Terminals**: open a PTY in a workspace, optionally running a one-off command.",
		"- **Automations**: schedule recurring agent runs (RFC 5545 RRULE), pause/resume/run them, and read run logs.",
		"- **Hosts and projects**: enumerate the machines and checked-out repositories available to the user.",
		"",
		"## Endpoints",
		"",
		`- MCP server (Streamable HTTP): \`${MCP_SERVER_URL}\` (alias: \`${API_URL}/mcp\`)`,
		`- Docs MCP server (no auth): \`${docsUrl}/mcp\``,
		`- MCP server card: \`${baseUrl}/.well-known/mcp/server-card.json\``,
		`- OpenAPI spec: \`${API_URL}/openapi.json\``,
		`- API catalog (RFC 9727): \`${baseUrl}/.well-known/api-catalog\``,
		`- A2A agent card: \`${baseUrl}/.well-known/agent-card.json\``,
		"",
		"## Authentication",
		"",
		`Full walkthrough: [auth.md](${baseUrl}/auth.md).`,
		"",
		`- Unauthenticated requests to the MCP endpoint return \`401\` with \`WWW-Authenticate: Bearer resource_metadata="${API_URL}/.well-known/oauth-protected-resource"\`.`,
		"- OAuth 2.1 authorization code + PKCE, with RFC 7591 dynamic client registration — no manual app setup needed.",
		"- Alternatively, a user-issued Superset API key can be sent as a Bearer token.",
		"",
		"## Setup one-liners",
		"",
		"```bash",
		`claude mcp add superset --transport http ${MCP_SERVER_URL}`,
		`codex mcp add superset --url ${MCP_SERVER_URL}`,
		`gemini mcp add --transport http superset ${MCP_SERVER_URL}`,
		"```",
		"",
		"## Learn more",
		"",
		`- [Docs](${docsUrl}) and [docs llms.txt](${docsUrl}/llms.txt)`,
		`- [Site llms.txt](${baseUrl}/llms.txt)`,
		`- [GitHub](${COMPANY.GITHUB_URL})`,
	];

	return new Response(lines.join("\n"), { headers: MARKDOWN_HEADERS });
}
