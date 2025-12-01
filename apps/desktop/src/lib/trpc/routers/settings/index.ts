import { db } from "main/lib/db";
import { publicProcedure, router } from "../..";

export const createSettingsRouter = () => {
	return router({
		getLastUsedApp: publicProcedure.query(() => {
			return db.data.settings.lastUsedApp ?? "cursor";
		}),
	});
};
