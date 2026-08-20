import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { CommandContextProvider } from "./core/ContextProvider";
import { useFrameStackStore } from "./core/frames";
import { registerAllModules } from "./modules";
import { CommandPalette } from "./ui/CommandPalette/CommandPalette";
import { DeleteWorkspaceMount } from "./ui/DeleteWorkspaceMount/DeleteWorkspaceMount";
import { FolderImportMount } from "./ui/FolderImportMount/FolderImportMount";
import { RemoveFromSidebarMount } from "./ui/RemoveFromSidebarMount/RemoveFromSidebarMount";
import { SetPreferredOpenInAppMount } from "./ui/SetPreferredOpenInAppMount/SetPreferredOpenInAppMount";

export function CommandPaletteHost({ children }: { children?: ReactNode }) {
	useEffect(() => {
		const unregister = registerAllModules();
		return unregister;
	}, []);

	return (
		<CommandContextProvider>
			<CommandPaletteTrigger />
			<CommandPalette />
			<DeleteWorkspaceMount />
			<RemoveFromSidebarMount />
			<SetPreferredOpenInAppMount />
			<FolderImportMount />
			{children}
		</CommandContextProvider>
	);
}

function CommandPaletteTrigger() {
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const reset = useFrameStackStore((s) => s.reset);
	const navigate = useNavigate();
	useHotkey("OPEN_COMMAND_PALETTE", () => setOpen(true));

	const openResources = () => {
		setOpen(false);
		reset();
		void navigate({ to: "/usage/resources" });
	};

	// Keeps CHECK_RESOURCES on the renderer's own hotkey binding (rather than a
	// native menu accelerator) so it stays user-customizable/disable-able via
	// Settings > Keyboard — see main/lib/menu.ts for why the "Resources" menu
	// item has no accelerator.
	useHotkey("CHECK_RESOURCES", openResources);

	// The native "Resources" menu item's click still opens the same view.
	electronTrpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type !== "check-resources") return;
			openResources();
		},
	});

	return null;
}
