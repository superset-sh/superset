import { COMPANY } from "@superset/shared/constants";
import { API_URL, MCP_SERVER_URL } from "@/lib/llms";

export function GET() {
	const baseUrl = COMPANY.MARKETING_URL;

	const card = {
		protocolVersion: "0.3.0",
		name: "Superset",
		description:
			"Superset runs parallel AI coding agents in isolated Git worktrees. This service speaks the Model Context Protocol (JSON-RPC over Streamable HTTP) rather than the A2A message protocol — connect an MCP client to the URL below to create workspaces, launch coding agents, schedule automations, and manage tasks on behalf of a Superset user.",
		url: MCP_SERVER_URL,
		preferredTransport: "JSONRPC",
		provider: {
			organization: COMPANY.NAME,
			url: baseUrl,
		},
		version: "1.0.0",
		documentationUrl: `${COMPANY.DOCS_URL}/mcp`,
		capabilities: {
			streaming: true,
			pushNotifications: false,
			stateTransitionHistory: false,
		},
		securitySchemes: {
			oauth2: {
				type: "oauth2",
				description:
					"OAuth 2.1 authorization code + PKCE with RFC 7591 dynamic client registration. Discovery via RFC 9728 protected resource metadata.",
				flows: {
					authorizationCode: {
						authorizationUrl: `${API_URL}/api/auth/oauth2/authorize`,
						tokenUrl: `${API_URL}/api/auth/oauth2/token`,
						scopes: {
							openid: "OpenID Connect",
							profile: "User profile",
							email: "User email",
							offline_access: "Refresh tokens",
						},
					},
				},
			},
		},
		defaultInputModes: ["application/json"],
		defaultOutputModes: ["application/json"],
		skills: [
			{
				id: "workspaces",
				name: "Workspace orchestration",
				description:
					"Create, list, rename, and delete branch- or PR-scoped Git worktree workspaces on a user's registered hosts.",
				tags: ["git", "worktree", "workspace"],
			},
			{
				id: "agents",
				name: "Coding-agent sessions",
				description:
					"Launch coding-agent sessions (Claude Code, Codex, OpenCode, and other CLI agents) with a prompt inside a workspace; list installed agent presets.",
				tags: ["coding-agent", "terminal"],
			},
			{
				id: "automations",
				name: "Scheduled automations",
				description:
					"Schedule recurring agent runs with RFC 5545 RRULEs, pause/resume/dispatch them, and read run logs.",
				tags: ["automation", "scheduling"],
			},
			{
				id: "tasks",
				name: "Task tracking",
				description:
					"Create, search, update, and delete tasks in a Superset organization, including statuses and member assignment.",
				tags: ["tasks", "project-management"],
			},
		],
		supportContact: COMPANY.MAIL_TO.replace("mailto:", ""),
	};

	return Response.json(card, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
