import { z } from "zod";
import { publicProcedure, router } from "../..";

const ExternalApp = z.enum([
	"finder",
	"vscode",
	"cursor",
	"xcode",
	"iterm",
	"warp",
	"terminal",
]);

type ExternalApp = z.infer<typeof ExternalApp>;

// Simple in-memory store (persists for app lifetime)
// Could be replaced with electron-store for persistence across restarts
let lastUsedApp: ExternalApp = "cursor";

export const createSettingsRouter = () => {
	return router({
		getLastUsedApp: publicProcedure.query(() => lastUsedApp),

		setLastUsedApp: publicProcedure.input(ExternalApp).mutation(({ input }) => {
			lastUsedApp = input;
			return lastUsedApp;
		}),
	});
};
