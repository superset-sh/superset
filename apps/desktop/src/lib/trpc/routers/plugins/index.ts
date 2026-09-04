import { TRPCError } from "@trpc/server";
import {
	getBundledSkillContent,
	getBundledSkillIcons,
	getBundledSkillPath,
	getDisabledSkills,
	installPlugin,
	setPluginEnabled,
	setSkillEnabled,
	uninstallPlugin,
	writeBundledSkillContent,
} from "main/lib/plugin-installs";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Materialization only: skills, agent config, and the local install record are
 * written here, never read back for display. Install state is the account's —
 * the UI reads plugins.list — so it is the same on every machine.
 */
export const createPluginsRouter = () => {
	return router({
		/** Per-skill icon data URIs shipped inside skill folders (icon.svg|png). */
		listSkillIcons: publicProcedure.query(() => {
			return getBundledSkillIcons();
		}),

		/** SKILL.md body and absolute path of a bundled managed skill, for the preview modal. */
		getSkillContent: publicProcedure
			.input(z.object({ name: z.string().min(1) }))
			.query(({ input }) => {
				return {
					content: getBundledSkillContent(input.name),
					path: getBundledSkillPath(input.name),
				};
			}),

		/** Names of bundled managed skills the user disabled. */
		getDisabledSkills: publicProcedure.query(() => {
			return getDisabledSkills();
		}),

		setSkillEnabled: publicProcedure
			.input(z.object({ name: z.string().min(1), enabled: z.boolean() }))
			.mutation(({ input }) => {
				const disabled = setSkillEnabled(input.name, input.enabled);
				if (disabled === null) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Unknown skill: ${input.name}`,
					});
				}
				return { disabled };
			}),

		/** Overwrites a bundled skill's SKILL.md, from the in-app editor. */
		writeSkillContent: publicProcedure
			.input(z.object({ name: z.string().min(1), content: z.string() }))
			.mutation(({ input }) => {
				try {
					writeBundledSkillContent(input.name, input.content);
				} catch (error) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message:
							error instanceof Error ? error.message : "Failed to save skill",
					});
				}
				return { ok: true };
			}),

		install: publicProcedure
			.input(z.object({ name: z.string().min(1) }))
			.mutation(({ input }) => {
				const installed = installPlugin(input.name);
				if (installed === null) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Unknown plugin: ${input.name}`,
					});
				}
				return { installed };
			}),

		uninstall: publicProcedure
			.input(z.object({ name: z.string().min(1) }))
			.mutation(({ input }) => {
				return { installed: uninstallPlugin(input.name) };
			}),

		setEnabled: publicProcedure
			.input(z.object({ name: z.string().min(1), enabled: z.boolean() }))
			.mutation(({ input }) => {
				return { installed: setPluginEnabled(input.name, input.enabled) };
			}),
	});
};
