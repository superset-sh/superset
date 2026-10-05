import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useHotkey } from "renderer/hotkeys";

/** Back/forward by hotkey and by the mouse's side buttons, wherever the buttons are on screen. */
export function useHistoryNavigationShortcuts() {
	const router = useRouter();

	useHotkey("NAVIGATE_BACK", () => router.history.back());
	useHotkey("NAVIGATE_FORWARD", () => router.history.forward());

	useEffect(() => {
		const handleMouseUp = (event: MouseEvent) => {
			if (event.button === 3) {
				event.preventDefault();
				router.history.back();
			} else if (event.button === 4) {
				event.preventDefault();
				router.history.forward();
			}
		};

		window.addEventListener("mouseup", handleMouseUp);
		return () => window.removeEventListener("mouseup", handleMouseUp);
	}, [router]);
}
