import { z } from "zod";
import { publicProcedure, router } from "../..";
import { extract, loadRegistry, resolveFeatures } from "@superset/atlas-engine";

function getAtlasPath(): string {
	const envPath = process.env.ATLAS_PATH;
	if (!envPath) throw new Error("ATLAS_PATH not set");
	return envPath;
}

export const createAtlasComposerRouter = () =>
	router({
		compose: publicProcedure
			.input(
				z.object({
					selected: z.array(z.string()),
					projectName: z.string().min(1),
					targetPath: z.string().min(1),
				}),
			)
			.mutation(({ input }) => {
				const atlasPath = getAtlasPath();
				const registry = loadRegistry(atlasPath);
				const resolved = resolveFeatures(registry, input.selected);

				const result = extract({
					sourcePath: atlasPath,
					targetPath: input.targetPath,
					registry,
					resolved,
				});

				return {
					...result,
					projectName: input.projectName,
				};
			}),
	});
