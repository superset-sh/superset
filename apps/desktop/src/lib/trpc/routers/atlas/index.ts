import { router } from "../..";
import { createAtlasComposerRouter } from "./composer";
import { createAtlasRegistryRouter } from "./registry";
import { createAtlasResolverRouter } from "./resolver";

export const createAtlasRouter = () =>
	router({
		registry: createAtlasRegistryRouter(),
		resolver: createAtlasResolverRouter(),
		composer: createAtlasComposerRouter(),
	});
