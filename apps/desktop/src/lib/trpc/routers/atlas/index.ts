import { router } from "../..";
import { createAtlasComposerRouter } from "./composer";
import { createAtlasDeploymentsRouter } from "./deployments";
import { createAtlasFeatureStudioRouter } from "./feature-studio";
import { createAtlasRegistryRouter } from "./registry";
import { createAtlasResolverRouter } from "./resolver";
import { createAtlasSupabaseRouter } from "./supabase";
import { createAtlasVercelRouter } from "./vercel";

export const createAtlasRouter = () =>
	router({
		registry: createAtlasRegistryRouter(),
		featureStudio: createAtlasFeatureStudioRouter(),
		resolver: createAtlasResolverRouter(),
		composer: createAtlasComposerRouter(),
		deployments: createAtlasDeploymentsRouter(),
		supabase: createAtlasSupabaseRouter(),
		vercel: createAtlasVercelRouter(),
	});
