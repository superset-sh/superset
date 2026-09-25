import { observable } from "@trpc/server/observable";
import {
	menuEmitter,
	type OpenSettingsEvent,
	type SettingsSection,
} from "main/lib/menu-events";
import { publicProcedure, router } from "..";

type MenuEvent =
	| { type: "open-settings"; data: OpenSettingsEvent }
	| { type: "open-project" }
	| { type: "toggle-presets-bar" }
	| { type: "check-resources" };

export const createMenuRouter = () => {
	return router({
		subscribe: publicProcedure.subscription(() => {
			return observable<MenuEvent>((emit) => {
				const onOpenSettings = (section?: SettingsSection) => {
					emit.next({ type: "open-settings", data: { section } });
				};

				const onOpenProject = () => {
					emit.next({ type: "open-project" });
				};

				const onTogglePresetsBar = () => {
					emit.next({ type: "toggle-presets-bar" });
				};

				const onCheckResources = () => {
					emit.next({ type: "check-resources" });
				};

				menuEmitter.on("open-settings", onOpenSettings);
				menuEmitter.on("open-project", onOpenProject);
				menuEmitter.on("toggle-presets-bar", onTogglePresetsBar);
				menuEmitter.on("check-resources", onCheckResources);

				return () => {
					menuEmitter.off("open-settings", onOpenSettings);
					menuEmitter.off("open-project", onOpenProject);
					menuEmitter.off("toggle-presets-bar", onTogglePresetsBar);
					menuEmitter.off("check-resources", onCheckResources);
				};
			});
		}),
	});
};
