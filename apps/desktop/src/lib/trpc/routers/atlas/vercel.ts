import { z } from "zod";
import { eq } from "drizzle-orm";
import { publicProcedure, router } from "../..";
import { localDb } from "main/lib/local-db";
import { atlasIntegrations, atlasProjects } from "@superset/local-db";
import { encrypt, decrypt } from "../auth/utils/crypto-storage";

const VERCEL_API = "https://api.vercel.com";

async function getVercelToken(): Promise<string> {
	const [integration] = await localDb
		.select()
		.from(atlasIntegrations)
		.where(eq(atlasIntegrations.service, "vercel"));
	if (!integration) throw new Error("Vercel token not configured");
	return decrypt(integration.encryptedToken);
}

async function vercelFetch(path: string, options: RequestInit = {}) {
	const token = await getVercelToken();
	const res = await fetch(`${VERCEL_API}${path}`, {
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

export const createAtlasVercelRouter = () =>
	router({
		saveToken: publicProcedure
			.input(z.object({ token: z.string().min(1) }))
			.mutation(async ({ input }) => {
				// Verify token works
				try {
					const res = await fetch(`${VERCEL_API}/v2/user`, {
						headers: { Authorization: `Bearer ${input.token}` },
					});
					if (!res.ok) throw new Error("Invalid token");
				} catch {
					throw new Error(
						"토큰 검증 실패: Vercel에 연결할 수 없습니다",
					);
				}

				const encrypted = encrypt(input.token);

				// Upsert: delete existing then insert
				await localDb
					.delete(atlasIntegrations)
					.where(eq(atlasIntegrations.service, "vercel"));

				await localDb.insert(atlasIntegrations).values({
					service: "vercel",
					encryptedToken: encrypted,
				});

				return { success: true };
			}),

		removeToken: publicProcedure.mutation(async () => {
			await localDb
				.delete(atlasIntegrations)
				.where(eq(atlasIntegrations.service, "vercel"));
			return { success: true };
		}),

		getConnectionStatus: publicProcedure.query(async () => {
			const [integration] = await localDb
				.select()
				.from(atlasIntegrations)
				.where(eq(atlasIntegrations.service, "vercel"));
			return { connected: !!integration };
		}),

		listTeams: publicProcedure.query(async () => {
			const data = await vercelFetch("/v2/teams");
			return (data.teams ?? []) as Array<{
				id: string;
				name: string;
				slug: string;
			}>;
		}),

		createProject: publicProcedure
			.input(
				z.object({
					name: z.string().min(1),
					teamId: z.string().optional(),
					framework: z.string().default("vite"),
					atlasProjectId: z.string().min(1),
				}),
			)
			.mutation(async ({ input }) => {
				const queryParams = input.teamId
					? `?teamId=${input.teamId}`
					: "";
				const project = await vercelFetch(
					`/v10/projects${queryParams}`,
					{
						method: "POST",
						body: JSON.stringify({
							name: input.name,
							framework: input.framework,
						}),
					},
				);

				// Update atlas_projects with Vercel info
				await localDb
					.update(atlasProjects)
					.set({
						vercelProjectId: project.id,
						vercelUrl: `https://${project.name}.vercel.app`,
						updatedAt: Date.now(),
					})
					.where(eq(atlasProjects.id, input.atlasProjectId));

				return {
					id: project.id,
					name: project.name,
					url: `https://${project.name}.vercel.app`,
				};
			}),

		generateDomain: publicProcedure
			.input(
				z.object({
					projectId: z.string().min(1),
					domain: z.string().min(1),
					teamId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const queryParams = input.teamId
					? `?teamId=${input.teamId}`
					: "";
				await vercelFetch(
					`/v10/projects/${input.projectId}/domains${queryParams}`,
					{
						method: "POST",
						body: JSON.stringify({ name: input.domain }),
					},
				);
				return { domain: input.domain };
			}),

		getDeployment: publicProcedure
			.input(
				z.object({
					deploymentId: z.string().min(1),
				}),
			)
			.query(async ({ input }) => {
				const deployment = await vercelFetch(
					`/v13/deployments/${input.deploymentId}`,
				);
				return {
					id: deployment.uid,
					url: deployment.url,
					readyState: deployment.readyState as string,
					state: deployment.state as string,
				};
			}),

		deploy: publicProcedure
			.input(
				z.object({
					projectId: z.string().min(1),
					projectName: z.string().min(1),
					teamId: z.string().optional(),
					atlasProjectId: z.string().min(1),
				}),
			)
			.mutation(async ({ input }) => {
				const queryParams = input.teamId
					? `?teamId=${input.teamId}`
					: "";

				// Create deployment with project link
				const deployment = await vercelFetch(
					`/v13/deployments${queryParams}`,
					{
						method: "POST",
						body: JSON.stringify({
							name: input.projectName,
							project: input.projectId,
							target: "production",
							projectSettings: {
								framework: "vite",
							},
						}),
					},
				);

				// Update atlas_projects with deployment info
				await localDb
					.update(atlasProjects)
					.set({
						vercelDeploymentId: deployment.id,
						vercelUrl: `https://${deployment.url}`,
						status: "deployed",
						updatedAt: Date.now(),
					})
					.where(eq(atlasProjects.id, input.atlasProjectId));

				return {
					id: deployment.id,
					url: `https://${deployment.url}`,
					readyState: deployment.readyState as string,
				};
			}),

		waitForReady: publicProcedure
			.input(z.object({ deploymentId: z.string().min(1) }))
			.mutation(async ({ input }) => {
				const maxAttempts = 60;
				const interval = 3000;

				for (let i = 0; i < maxAttempts; i++) {
					try {
						const deployment = await vercelFetch(
							`/v13/deployments/${input.deploymentId}`,
						);
						if (deployment.readyState === "READY") {
							return {
								ready: true,
								url: `https://${deployment.url}`,
								attempts: i + 1,
							};
						}
						if (
							deployment.readyState === "ERROR" ||
							deployment.readyState === "CANCELED"
						) {
							return {
								ready: false,
								url: null,
								attempts: i + 1,
								error: `Deployment ${deployment.readyState}`,
							};
						}
					} catch {
						// Might not be ready yet
					}
					await new Promise((r) => setTimeout(r, interval));
				}
				return {
					ready: false,
					url: null,
					attempts: maxAttempts,
					error: "Deployment timeout",
				};
			}),
	});
