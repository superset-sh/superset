import { z } from "zod";
import { publicProcedure, router } from "../..";
import { loadRegistry, resolveFeatures } from "@superset/atlas-engine";

function getAtlasPath(): string {
	const envPath = process.env.ATLAS_PATH;
	if (!envPath) throw new Error("ATLAS_PATH not set");
	return envPath;
}

export const createAtlasResolverRouter = () =>
	router({
		resolve: publicProcedure
			.input(z.object({ selected: z.array(z.string()) }))
			.query(({ input }) => {
				const atlasPath = getAtlasPath();
				const registry = loadRegistry(atlasPath);
				return resolveFeatures(registry, input.selected);
			}),
	});
