import { useNavigate } from "@tanstack/react-router";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Keeps CHECK_RESOURCES on the renderer's own hotkey binding (rather than a
 * native menu accelerator) so it stays user-customizable/disable-able via
 * Settings > Keyboard — see main/lib/menu.ts for why the "Resources" menu
 * item has no accelerator. The native "Resources" menu item's click opens
 * the same view.
 */
export function useCheckResourcesHotkey(onBeforeNavigate?: () => void) {
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
