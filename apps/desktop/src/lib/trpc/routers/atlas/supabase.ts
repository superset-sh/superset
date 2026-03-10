import { z } from "zod";
import { eq } from "drizzle-orm";
import { writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { publicProcedure, router } from "../..";
import { localDb } from "main/lib/local-db";
import { atlasIntegrations, atlasProjects } from "@superset/local-db";
import { encrypt, decrypt } from "../auth/utils/crypto-storage";

const SUPABASE_API = "https://api.supabase.com/v1";

async function getSupabaseToken(): Promise<string> {
	// env 우선, DB fallback
	const envToken = process.env.SUPABASE_ACCESS_TOKEN;
	if (envToken) return envToken;

	const [integration] = await localDb
		.select()
		.from(atlasIntegrations)
		.where(eq(atlasIntegrations.service, "supabase"));
	if (!integration) throw new Error("Supabase token not configured");
	return decrypt(integration.encryptedToken);
}

async function supabaseFetch(path: string, options: RequestInit = {}) {
	const token = await getSupabaseToken();
	const res = await fetch(`${SUPABASE_API}${path}`, {
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

export const createAtlasSupabaseRouter = () =>
	router({
		saveToken: publicProcedure
			.input(z.object({ token: z.string().min(1) }))
			.mutation(async ({ input }) => {
				const encrypted = encrypt(input.token);

				// Verify token works by calling /organizations
				try {
					const res = await fetch(`${SUPABASE_API}/organizations`, {
						headers: { Authorization: `Bearer ${input.token}` },
					});
					if (!res.ok) throw new Error("Invalid token");
				} catch {
					throw new Error(
						"토큰 검증 실패: Supabase에 연결할 수 없습니다",
					);
				}

				// Upsert: delete existing then insert
				await localDb
					.delete(atlasIntegrations)
					.where(eq(atlasIntegrations.service, "supabase"));

				await localDb.insert(atlasIntegrations).values({
					service: "supabase",
					encryptedToken: encrypted,
				});

				return { success: true };
			}),

		removeToken: publicProcedure.mutation(async () => {
			await localDb
				.delete(atlasIntegrations)
				.where(eq(atlasIntegrations.service, "supabase"));
			return { success: true };
		}),

		getConnectionStatus: publicProcedure.query(async () => {
			if (process.env.SUPABASE_ACCESS_TOKEN) return { connected: true };
			const [integration] = await localDb
				.select()
				.from(atlasIntegrations)
				.where(eq(atlasIntegrations.service, "supabase"));
			return { connected: !!integration };
		}),

		listOrganizations: publicProcedure.query(async () => {
			const orgs = await supabaseFetch("/organizations");
			return orgs as Array<{ id: string; name: string; slug: string }>;
		}),

		createProject: publicProcedure
			.input(
				z.object({
					name: z.string().min(1),
					organizationId: z.string().min(1),
					dbPassword: z.string().min(8),
					region: z.string().default("ap-northeast-2"),
					atlasProjectId: z.string().min(1),
				}),
			)
			.mutation(async ({ input }) => {
				const project = await supabaseFetch("/projects", {
					method: "POST",
					body: JSON.stringify({
						name: input.name,
						organization_id: input.organizationId,
						db_pass: input.dbPassword,
						region: input.region,
					}),
				});

				// Update atlas_projects with Supabase info
				await localDb
					.update(atlasProjects)
					.set({
						supabaseProjectId: project.id,
						supabaseProjectUrl: `https://${project.id}.supabase.co`,
						updatedAt: Date.now(),
					})
					.where(eq(atlasProjects.id, input.atlasProjectId));

				return {
					id: project.id,
					name: project.name,
					region: project.region,
					url: `https://${project.id}.supabase.co`,
				};
			}),

		waitForHealthy: publicProcedure
			.input(z.object({ projectRef: z.string() }))
			.mutation(async ({ input }) => {
				const maxAttempts = 90;
				const interval = 5000; // 5 seconds (총 7.5분)

				for (let i = 0; i < maxAttempts; i++) {
					try {
						// /projects/{ref} 엔드포인트로 status 직접 확인
						const project = await supabaseFetch(
							`/projects/${input.projectRef}`,
						);
						if (project.status === "ACTIVE_HEALTHY") {
							return { healthy: true, attempts: i + 1 };
						}
					} catch {
						// Project might not be ready yet
					}
					await new Promise((r) => setTimeout(r, interval));
				}
				return { healthy: false, attempts: maxAttempts };
			}),

		getApiKeys: publicProcedure
			.input(z.object({ projectRef: z.string() }))
			.query(async ({ input }) => {
				const keys = await supabaseFetch(
					`/projects/${input.projectRef}/api-keys?reveal=true`,
				);
				const anonKey = (
					keys as Array<{ name: string; api_key: string }>
				).find((k) => k.name === "anon");
				const serviceKey = (
					keys as Array<{ name: string; api_key: string }>
				).find((k) => k.name === "service_role");

				return {
					anonKey: anonKey?.api_key ?? null,
					serviceRoleKey: serviceKey?.api_key ?? null,
				};
			}),

		writeEnvFile: publicProcedure
			.input(
				z.object({
					projectPath: z.string(),
					projectRef: z.string(),
					anonKey: z.string(),
					serviceRoleKey: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
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
					? `${existing}\n\n# Supabase (auto-generated by Atlas Composer)\n${supabaseEnv}\n`
					: `# Supabase (auto-generated by Atlas Composer)\n${supabaseEnv}\n`;

				await writeFile(envPath, newContent, "utf-8");
				return { envPath };
			}),
	});
