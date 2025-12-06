import { observable } from "@trpc/server/observable";
import {
	menuEmitter,
	type OpenSettingsEvent,
	type SettingsSection,
} from "main/lib/menu-events";
import { publicProcedure, router } from "..";

type MenuEvent = { type: "open-settings"; data: OpenSettingsEvent };

export const createMenuRouter = () => {
	return router({
		subscribe: publicProcedure.subscription(() => {
			return observable<MenuEvent>((emit) => {
				const onOpenSettings = (section?: SettingsSection) => {
					emit.next({ type: "open-settings", data: { section } });
				};

				menuEmitter.on("open-settings", onOpenSettings);

				return () => {
					menuEmitter.off("open-settings", onOpenSettings);
				};
			});
		}),
	});
};
