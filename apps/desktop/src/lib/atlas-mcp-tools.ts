/**
 * Atlas MCP Tools — Mastra Tool definitions for Supabase/Vercel operations.
 * These tools are injected into the agent runtime via `extraTools` in createMastraCode().
 * They reuse the same localDb and token storage as the existing tRPC routers.
 */
import { createTool } from "@mastra/core/tools";
import { eq } from "drizzle-orm";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { localDb } from "main/lib/local-db";
import { atlasIntegrations, atlasProjects } from "@superset/local-db";
import { decrypt } from "./trpc/routers/auth/utils/crypto-storage";

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

async function getTokenForService(
	service: "supabase" | "vercel",
): Promise<string | null> {
	// env 우선, DB fallback
	const envKey = service === "supabase" ? "SUPABASE_ACCESS_TOKEN" : "VERCEL_TOKEN";
	const envToken = process.env[envKey];
	if (envToken) return envToken;

	const [integration] = await localDb
		.select()
		.from(atlasIntegrations)
		.where(eq(atlasIntegrations.service, service));
	if (!integration) return null;
	return decrypt(integration.encryptedToken);
}

async function supabaseFetch(path: string, options: RequestInit = {}) {
	const token = await getTokenForService("supabase");
	if (!token)
		throw new Error(
			"Supabase 토큰이 설정되지 않았습니다. 먼저 Atlas → Composer에서 Supabase를 연결하세요.",
		);
	const res = await fetch(`https://api.supabase.com/v1${path}`, {
		...options,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			...options.headers,
		},
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Supabase API error (${res.status}): ${body}`);
	}
	return res.json();
}

async function vercelFetch(path: string, options: RequestInit = {}) {
	const token = await getTokenForService("vercel");
	if (!token)
		throw new Error(
			"Vercel 토큰이 설정되지 않았습니다. 먼저 Atlas → Composer에서 Vercel을 연결하세요.",
		);
	const res = await fetch(`https://api.vercel.com${path}`, {
		...options,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			...options.headers,
		},
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Vercel API error (${res.status}): ${body}`);
	}
	return res.json();
}

// ---------------------------------------------------------------------------
// Supabase Tools
// ---------------------------------------------------------------------------

export const atlasSupabaseStatusTool = createTool({
	id: "atlas_supabase_status",
	description:
		"Check if Supabase is connected (PAT token configured). Returns connection status.",
	inputSchema: z.object({}),
	outputSchema: z.object({ connected: z.boolean() }),
	execute: async () => {
		const token = await getTokenForService("supabase");
		return { connected: !!token };
	},
});

export const atlasSupabaseListOrgsTool = createTool({
	id: "atlas_supabase_list_organizations",
	description:
		"List all Supabase organizations the user belongs to. Requires Supabase PAT to be configured.",
	inputSchema: z.object({}),
	outputSchema: z.object({
		organizations: z.array(
			z.object({ id: z.string(), name: z.string(), slug: z.string() }),
		),
	}),
	execute: async () => {
		const orgs = (await supabaseFetch("/organizations")) as Array<{
			id: string;
			name: string;
			slug: string;
		}>;
		return { organizations: orgs };
	},
});

export const atlasSupabaseCreateProjectTool = createTool({
	id: "atlas_supabase_create_project",
	description:
		"Create a new Supabase project in the given organization. Returns the project URL and ID. Optionally links to an Atlas project.",
	inputSchema: z.object({
		name: z.string().describe("Project name"),
		organizationId: z.string().describe("Supabase organization ID"),
		dbPassword: z
			.string()
			.min(8)
			.describe("Database password (min 8 chars)"),
		region: z
			.string()
			.default("ap-northeast-2")
			.describe("Supabase region (default: ap-northeast-2)"),
		atlasProjectId: z
			.string()
			.optional()
			.describe("Atlas project ID to link (optional)"),
	}),
	outputSchema: z.object({
		id: z.string(),
		name: z.string(),
		region: z.string(),
		url: z.string(),
	}),
	execute: async (input) => {
		const project = await supabaseFetch("/projects", {
			method: "POST",
			body: JSON.stringify({
				name: input.name,
				organization_id: input.organizationId,
				db_pass: input.dbPassword,
				region: input.region,
			}),
		});

		if (input.atlasProjectId) {
			await localDb
				.update(atlasProjects)
				.set({
					supabaseProjectId: project.id,
					supabaseProjectUrl: `https://${project.id}.supabase.co`,
					updatedAt: Date.now(),
				})
				.where(eq(atlasProjects.id, input.atlasProjectId));
		}

		return {
			id: project.id,
			name: project.name,
			region: project.region,
			url: `https://${project.id}.supabase.co`,
		};
	},
});

export const atlasSupabaseGetApiKeysTool = createTool({
	id: "atlas_supabase_get_api_keys",
	description:
		"Get the anon key and service_role key for a Supabase project. Useful for setting up .env files.",
	inputSchema: z.object({
		projectRef: z.string().describe("Supabase project reference ID"),
	}),
	outputSchema: z.object({
		anonKey: z.string().nullable(),
		serviceRoleKey: z.string().nullable(),
	}),
	execute: async (input) => {
		const keys = (await supabaseFetch(
			`/projects/${input.projectRef}/api-keys?reveal=true`,
		)) as Array<{ name: string; api_key: string }>;
		const anonKey = keys.find((k) => k.name === "anon");
		const serviceKey = keys.find((k) => k.name === "service_role");
		return {
			anonKey: anonKey?.api_key ?? null,
			serviceRoleKey: serviceKey?.api_key ?? null,
		};
	},
});

export const atlasSupabaseWriteEnvTool = createTool({
	id: "atlas_supabase_write_env",
	description:
		"Write Supabase environment variables (URL, anon key, service role key) to a .env file in the given project path.",
	inputSchema: z.object({
		projectPath: z.string().describe("Absolute path to the project directory"),
		projectRef: z.string().describe("Supabase project reference ID"),
		anonKey: z.string().describe("Supabase anon key"),
		serviceRoleKey: z.string().describe("Supabase service role key"),
	}),
	outputSchema: z.object({ envPath: z.string() }),
	execute: async (input) => {
		const envPath = join(input.projectPath, ".env");
		let existing = "";
		try {
			existing = await readFile(envPath, "utf-8");
		} catch {
			// File doesn't exist yet
		}

		const supabaseEnv = [
			`VITE_SUPABASE_URL=https://${input.projectRef}.supabase.co`,
			`VITE_SUPABASE_PUBLISHABLE_KEY=${input.anonKey}`,
			`SUPABASE_SECRET_KEY=${input.serviceRoleKey}`,
		].join("\n");

		const newContent = existing
			? `${existing}\n\n# Supabase (auto-generated by Atlas Agent)\n${supabaseEnv}\n`
			: `# Supabase (auto-generated by Atlas Agent)\n${supabaseEnv}\n`;

		await writeFile(envPath, newContent, "utf-8");
		return { envPath };
	},
});

// ---------------------------------------------------------------------------
// Vercel Tools
// ---------------------------------------------------------------------------

export const atlasVercelStatusTool = createTool({
	id: "atlas_vercel_status",
	description:
		"Check if Vercel is connected (PAT token configured). Returns connection status.",
	inputSchema: z.object({}),
	outputSchema: z.object({ connected: z.boolean() }),
	execute: async () => {
		const token = await getTokenForService("vercel");
		return { connected: !!token };
	},
});

export const atlasVercelListTeamsTool = createTool({
	id: "atlas_vercel_list_teams",
	description:
		"List all Vercel teams the user belongs to. Requires Vercel PAT to be configured.",
	inputSchema: z.object({}),
	outputSchema: z.object({
		teams: z.array(
			z.object({ id: z.string(), name: z.string(), slug: z.string() }),
		),
	}),
	execute: async () => {
		const data = await vercelFetch("/v2/teams");
		return {
			teams: (data.teams ?? []) as Array<{
				id: string;
				name: string;
				slug: string;
			}>,
		};
	},
});

export const atlasVercelCreateProjectTool = createTool({
	id: "atlas_vercel_create_project",
	description:
		"Create a new Vercel project. Optionally links to an Atlas project.",
	inputSchema: z.object({
		name: z.string().describe("Project name (kebab-case recommended)"),
		teamId: z.string().optional().describe("Vercel team ID (optional, for personal account leave empty)"),
		framework: z.string().default("vite").describe("Framework (default: vite)"),
		atlasProjectId: z
			.string()
			.optional()
			.describe("Atlas project ID to link (optional)"),
	}),
	outputSchema: z.object({
		id: z.string(),
		name: z.string(),
		url: z.string(),
	}),
	execute: async (input) => {
		const queryParams = input.teamId ? `?teamId=${input.teamId}` : "";
		const project = await vercelFetch(`/v10/projects${queryParams}`, {
			method: "POST",
			body: JSON.stringify({
				name: input.name,
				framework: input.framework,
			}),
		});

		if (input.atlasProjectId) {
			await localDb
				.update(atlasProjects)
				.set({
					vercelProjectId: project.id,
					vercelUrl: `https://${project.name}.vercel.app`,
					updatedAt: Date.now(),
				})
				.where(eq(atlasProjects.id, input.atlasProjectId));
		}

		return {
			id: project.id,
			name: project.name,
			url: `https://${project.name}.vercel.app`,
		};
	},
});

export const atlasVercelDeployTool = createTool({
	id: "atlas_vercel_deploy",
	description:
		"Deploy a Vercel project. Returns deployment URL and status. Optionally links to an Atlas project.",
	inputSchema: z.object({
		projectId: z.string().describe("Vercel project ID"),
		projectName: z.string().describe("Vercel project name"),
		teamId: z.string().optional().describe("Vercel team ID (optional)"),
		atlasProjectId: z
			.string()
			.optional()
			.describe("Atlas project ID to link (optional)"),
	}),
	outputSchema: z.object({
		id: z.string(),
		url: z.string(),
		readyState: z.string(),
	}),
	execute: async (input) => {
		const queryParams = input.teamId ? `?teamId=${input.teamId}` : "";
		const deployment = await vercelFetch(`/v13/deployments${queryParams}`, {
			method: "POST",
			body: JSON.stringify({
				name: input.projectName,
				project: input.projectId,
				target: "production",
				projectSettings: { framework: "vite" },
			}),
		});

		if (input.atlasProjectId) {
			await localDb
				.update(atlasProjects)
				.set({
					vercelDeploymentId: deployment.id,
					vercelUrl: `https://${deployment.url}`,
					updatedAt: Date.now(),
				})
				.where(eq(atlasProjects.id, input.atlasProjectId));
		}

		return {
			id: deployment.id,
			url: `https://${deployment.url}`,
			readyState: deployment.readyState as string,
		};
	},
});

export const atlasVercelGetDeploymentTool = createTool({
	id: "atlas_vercel_get_deployment",
	description:
		"Check the status of a Vercel deployment by its ID. Returns readyState (READY, BUILDING, ERROR, etc).",
	inputSchema: z.object({
		deploymentId: z.string().describe("Vercel deployment ID"),
	}),
	outputSchema: z.object({
		id: z.string(),
		url: z.string(),
		readyState: z.string(),
		state: z.string(),
	}),
	execute: async (input) => {
		const deployment = await vercelFetch(
			`/v13/deployments/${input.deploymentId}`,
		);
		return {
			id: deployment.uid,
			url: deployment.url,
			readyState: deployment.readyState as string,
			state: deployment.state as string,
		};
	},
});

// ---------------------------------------------------------------------------
// Atlas Project Tools
// ---------------------------------------------------------------------------

export const atlasListProjectsTool = createTool({
	id: "atlas_list_projects",
	description:
		"List all Atlas projects (created via Composer). Shows name, path, features, status, and linked services.",
	inputSchema: z.object({}),
	outputSchema: z.object({
		projects: z.array(
			z.object({
				id: z.string(),
				name: z.string(),
				localPath: z.string(),
				features: z.array(z.string()),
				status: z.string(),
				supabaseProjectUrl: z.string().nullable(),
				vercelUrl: z.string().nullable(),
			}),
		),
	}),
	execute: async () => {
		const projects = await localDb.select().from(atlasProjects);
		return {
			projects: projects.map((p) => ({
				id: p.id,
				name: p.name,
				localPath: p.localPath,
				features: p.features,
				status: p.status,
				supabaseProjectUrl: p.supabaseProjectUrl,
				vercelUrl: p.vercelUrl,
			})),
		};
	},
});

// ---------------------------------------------------------------------------
// Export all tools as a flat record for extraTools injection
// ---------------------------------------------------------------------------

export function getAtlasMcpTools(): Record<string, unknown> {
	return {
		atlas_supabase_status: atlasSupabaseStatusTool,
		atlas_supabase_list_organizations: atlasSupabaseListOrgsTool,
		atlas_supabase_create_project: atlasSupabaseCreateProjectTool,
		atlas_supabase_get_api_keys: atlasSupabaseGetApiKeysTool,
		atlas_supabase_write_env: atlasSupabaseWriteEnvTool,
		atlas_vercel_status: atlasVercelStatusTool,
		atlas_vercel_list_teams: atlasVercelListTeamsTool,
		atlas_vercel_create_project: atlasVercelCreateProjectTool,
		atlas_vercel_deploy: atlasVercelDeployTool,
		atlas_vercel_get_deployment: atlasVercelGetDeploymentTool,
		atlas_list_projects: atlasListProjectsTool,
	};
}
