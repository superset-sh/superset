import { z } from "zod";
import { hostSettings } from "../../../db/schema";
import { checkDockerAvailable } from "../../../runtime/sandbox/docker-cli";
import { protectedProcedure, router } from "../../index";

export const SANDBOX_PROVIDERS = ["docker"] as const;
export type SandboxProvider = (typeof SANDBOX_PROVIDERS)[number];

export interface HostSandboxDefaults {
	/** Sandbox NEW workspaces by default. Project config overrides per repo. */
	enabled: boolean;
	provider: SandboxProvider;
	/** Whether the docker daemon answered a probe just now — UI hint only. */
	dockerAvailable: boolean;
}

/**
 * Host-wide sandbox default for new workspaces, stored in the single-row
 * `host_settings` table (`id = 1`). Applies at workspace creation (the sticky
 * per-workspace `sandboxEnabled` snapshot); a project's explicit
 * `sandbox.enabled` in `.superset/config.json` always wins over this default.
 */
export const sandboxDefaultsRouter = router({
	get: protectedProcedure.query(
		async ({ ctx }): Promise<HostSandboxDefaults> => {
			const row = ctx.db.select().from(hostSettings).get();
			const docker = await checkDockerAvailable();
			return {
				enabled: row?.sandboxNewWorkspaces ?? false,
				provider: row?.sandboxProvider ?? "docker",
				dockerAvailable: docker.ok,
			};
		},
	),

	set: protectedProcedure
		.input(
			z.object({
				enabled: z.boolean(),
				provider: z.enum(SANDBOX_PROVIDERS).default("docker"),
			}),
		)
		.mutation(({ ctx, input }) => {
			const values = {
				sandboxNewWorkspaces: input.enabled,
				sandboxProvider: input.provider,
			};
			ctx.db
				.insert(hostSettings)
				.values({ id: 1, ...values })
				.onConflictDoUpdate({ target: hostSettings.id, set: values })
				.run();
			return { success: true as const };
		}),
});
