import { observable } from "@trpc/server/observable";
import {
	menuEmitter,
	type OpenSettingsEvent,
	type OpenWorkspaceEvent,
	type SettingsSection,
} from "main/lib/menu-events";
import { publicProcedure, router } from "..";

type MenuEvent =
	| { type: "open-settings"; data: OpenSettingsEvent }
	| { type: "open-workspace"; data: OpenWorkspaceEvent }
	| { type: "open-project" }
	| { type: "toggle-presets-bar" };

export const createMenuRouter = () => {
	return router({
		subscribe: publicProcedure.subscription(() => {
			return observable<MenuEvent>((emit) => {
				const onOpenSettings = (section?: SettingsSection) => {
					emit.next({ type: "open-settings", data: { section } });
				};

				const onOpenWorkspace = (workspaceId: string) => {
					emit.next({ type: "open-workspace", data: { workspaceId } });
				};

				const onOpenProject = () => {
					emit.next({ type: "open-project" });
				};

				const onTogglePresetsBar = () => {
					emit.next({ type: "toggle-presets-bar" });
				};

				menuEmitter.on("open-settings", onOpenSettings);
				menuEmitter.on("open-workspace", onOpenWorkspace);
				menuEmitter.on("open-project", onOpenProject);
				menuEmitter.on("toggle-presets-bar", onTogglePresetsBar);

				return () => {
					menuEmitter.off("open-settings", onOpenSettings);
					menuEmitter.off("open-workspace", onOpenWorkspace);
					menuEmitter.off("open-project", onOpenProject);
					menuEmitter.off("toggle-presets-bar", onTogglePresetsBar);
				};
			});
		}),
	});
};
