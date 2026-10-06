import { msg } from "@lingui/core/macro";
import {
	SkillExistsError,
	SkillNameError,
	SkillSourceError,
} from "@superset/agent-setup";
import { i18n } from "@superset/i18n";
import { MAX_SKILL_NAME_LENGTH } from "@superset/shared/skills";
import { TRPCError } from "@trpc/server";
import type { BrowserWindow } from "electron";
import { dialog } from "electron";
import {
	createSkill,
	deleteSkill,
	getBundledSkillIcons,
	importSkill,
	listSkills,
	readSkillContent,
	SkillNotFoundError,
	SkillProjectError,
	setSkillEnabled,
	writeSkillContent,
} from "main/lib/skills";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const skillRefSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("managed"), name: z.string().min(1) }),
	z.object({ kind: z.literal("user"), dir: z.string().min(1) }),
]);

const userScopeSchema = z.object({
	scope: z.enum(["personal", "project"]),
	projectId: z.string().optional(),
});

function toTrpcError(error: unknown): TRPCError {
	if (error instanceof TRPCError) return error;
	const code =
		error instanceof SkillNameError || error instanceof SkillSourceError
			? "BAD_REQUEST"
			: error instanceof SkillExistsError
				? "CONFLICT"
				: error instanceof SkillNotFoundError ||
						error instanceof SkillProjectError
					? "NOT_FOUND"
					: "INTERNAL_SERVER_ERROR";
	return new TRPCError({
		code,
		message: error instanceof Error ? error.message : String(error),
		cause: error,
	});
}

function guard<T>(run: () => T): T {
	try {
		return run();
	} catch (error) {
		throw toTrpcError(error);
	}
}

export const createSkillsRouter = (getWindow: () => BrowserWindow | null) => {
	return router({
		list: publicProcedure
			.input(z.object({ projectId: z.string().optional() }).optional())
			.query(({ input }) => listSkills(input ?? {})),

		listIcons: publicProcedure.query(() => getBundledSkillIcons()),

		getContent: publicProcedure
			.input(skillRefSchema)
			.query(({ input }) => readSkillContent(input)),

		write: publicProcedure
			.input(z.object({ ref: skillRefSchema, content: z.string() }))
			.mutation(({ input }) => {
				guard(() => writeSkillContent(input.ref, input.content));
				return { ok: true };
			}),

		create: publicProcedure
			.input(
				userScopeSchema.extend({
					name: z.string().min(1).max(MAX_SKILL_NAME_LENGTH),
					description: z.string().min(1).max(1024),
				}),
			)
			.mutation(({ input }) => guard(() => createSkill(input))),

		importFromFolder: publicProcedure
			.input(userScopeSchema)
			.mutation(async ({ input }) => {
				const options: Electron.OpenDialogOptions = {
					properties: ["openDirectory"],
					title: i18n._(msg({ message: "Choose a skill folder" })),
					message: i18n._(
						msg({ message: "Pick a folder that contains a SKILL.md" }),
					),
					buttonLabel: i18n._(msg({ message: "Import" })),
				};
				const window = getWindow();
				const result = window
					? await dialog.showOpenDialog(window, options)
					: await dialog.showOpenDialog(options);
				const sourceDir = result.filePaths[0];
				if (result.canceled || !sourceDir) {
					return { canceled: true as const, skill: null };
				}
				return {
					canceled: false as const,
					skill: guard(() => importSkill({ ...input, sourceDir })),
				};
			}),

		delete: publicProcedure
			.input(z.object({ dir: z.string().min(1) }))
			.mutation(({ input }) => {
				guard(() => deleteSkill(input.dir));
				return { ok: true };
			}),

		setEnabled: publicProcedure
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
	});
};
