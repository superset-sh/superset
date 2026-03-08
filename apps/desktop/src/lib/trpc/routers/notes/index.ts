import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const NOTES_DIR = ".superset/notes";

export const createNotesRouter = () => {
	return router({
		read: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					fileName: z.string(),
				}),
			)
			.query(async ({ input }) => {
				const filePath = path.join(
					input.worktreePath,
					NOTES_DIR,
					input.fileName,
				);
				try {
					return await fs.readFile(filePath, "utf-8");
				} catch {
					return null;
				}
			}),

		write: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
					fileName: z.string(),
					content: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const dirPath = path.join(input.worktreePath, NOTES_DIR);
				await fs.mkdir(dirPath, { recursive: true });
				const filePath = path.join(dirPath, input.fileName);
				await fs.writeFile(filePath, input.content, "utf-8");
			}),

		list: publicProcedure
			.input(
				z.object({
					worktreePath: z.string(),
				}),
			)
			.query(async ({ input }) => {
				const dirPath = path.join(input.worktreePath, NOTES_DIR);
				try {
					const entries = await fs.readdir(dirPath);
					return entries.filter((e) => e.endsWith(".md"));
				} catch {
					return [];
				}
			}),
	});
};
