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
	| { type: "terminal-zoom-in" }
	| { type: "terminal-zoom-out" };

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

				const onTerminalZoomIn = () => {
					emit.next({ type: "terminal-zoom-in" });
				};

				const onTerminalZoomOut = () => {
					emit.next({ type: "terminal-zoom-out" });
				};

				menuEmitter.on("open-settings", onOpenSettings);
				menuEmitter.on("open-workspace", onOpenWorkspace);
				menuEmitter.on("terminal-zoom-in", onTerminalZoomIn);
				menuEmitter.on("terminal-zoom-out", onTerminalZoomOut);

				return () => {
					menuEmitter.off("open-settings", onOpenSettings);
					menuEmitter.off("open-workspace", onOpenWorkspace);
					menuEmitter.off("terminal-zoom-in", onTerminalZoomIn);
					menuEmitter.off("terminal-zoom-out", onTerminalZoomOut);
				};
			});
		}),
	});
};
