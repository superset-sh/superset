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
import { QuickCreateWorkspaceMount } from "./ui/QuickCreateWorkspaceMount/QuickCreateWorkspaceMount";
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
			<QuickCreateWorkspaceMount />
			{children}
		</CommandContextProvider>
	);
}

/**
 * Keeps CHECK_RESOURCES on the renderer's own hotkey binding (rather than a
 * native menu accelerator) so it stays user-customizable/disable-able via
 * Settings > Keyboard — see main/lib/menu.ts for why the "Resources" menu
 * item has no accelerator. The native "Resources" menu item's click opens
 * the same view.
 */
function useCheckResourcesHotkey(onBeforeNavigate?: () => void) {
	const navigate = useNavigate();

	const openResources = () => {
		onBeforeNavigate?.();
		void navigate({ to: "/settings/usage/resources" });
	};

	useHotkey("CHECK_RESOURCES", openResources);

	electronTrpc.menu.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type !== "check-resources") return;
			openResources();
		},
	});
}

function CommandPaletteTrigger() {
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const reset = useFrameStackStore((s) => s.reset);
	useHotkey("OPEN_COMMAND_PALETTE", () => setOpen(true));

	useCheckResourcesHotkey(() => {
		setOpen(false);
		reset();
	});

	return null;
}

/**
 * CommandPaletteHost only mounts inside the _dashboard route tree, so routes
 * outside it (Settings) need their own mount for CHECK_RESOURCES — otherwise
 * the hotkey and the native "Resources" menu item go dead the moment the
 * user navigates into Settings, including on the Usage/Resources page they
 * point at.
 */
export function CheckResourcesHotkeyMount() {
	useCheckResourcesHotkey();
	return null;
}
