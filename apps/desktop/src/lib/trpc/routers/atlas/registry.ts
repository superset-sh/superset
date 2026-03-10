import { z } from "zod";
import { publicProcedure, router } from "../..";
import { loadConfig, loadRegistry, validateRegistry } from "@superset/atlas-engine";

function getAtlasPath(): string {
	const envPath = process.env.ATLAS_PATH;
	if (envPath) return envPath;

	try {
		const { app } = require("electron");
		const { join } = require("node:path");
		const appPath = app.getAppPath();
		const config = loadConfig(join(appPath, ".."));
		return config.sources[0].localPath;
	} catch {
		throw new Error(
			"Feature Atlas path not configured. Set ATLAS_PATH env var or create .superbuilder/config.json",
		);
	}
}

export const createAtlasRegistryRouter = () =>
	router({
		getRegistry: publicProcedure.query(() => {
			const atlasPath = getAtlasPath();
			const registry = loadRegistry(atlasPath);
			const errors = validateRegistry(registry);
			return { registry, errors };
		}),

		listFeatures: publicProcedure.query(() => {
			const atlasPath = getAtlasPath();
			const registry = loadRegistry(atlasPath);
			return Object.entries(registry.features).map(([id, entry]) => ({
				id,
				...entry,
			}));
		}),

		getFeature: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				const atlasPath = getAtlasPath();
				const registry = loadRegistry(atlasPath);
				const entry = registry.features[input.id];
				if (!entry) throw new Error(`Feature not found: ${input.id}`);
				return { id: input.id, ...entry };
			}),

		getGroups: publicProcedure.query(() => {
			const atlasPath = getAtlasPath();
			const registry = loadRegistry(atlasPath);
			return registry.groups;
		}),
	});
