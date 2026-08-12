import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { UI_FONT_FAMILY_CSS_VAR } from "renderer/lib/ui-font";

/**
 * Mirrors the Interface font setting onto <html> as a CSS variable so the whole
 * renderer picks it up. Renders nothing.
 */
export function UiFontSync() {
	const { data } = electronTrpc.settings.getFontSettings.useQuery();
	const uiFontFamily = data?.uiFontFamily ?? null;

	useEffect(() => {
		const root = document.documentElement;
		if (uiFontFamily) {
			root.style.setProperty(UI_FONT_FAMILY_CSS_VAR, uiFontFamily);
			root.style.setProperty("--font-sans", uiFontFamily);
		} else {
			root.style.removeProperty(UI_FONT_FAMILY_CSS_VAR);
			root.style.removeProperty("--font-sans");
		}
	}, [uiFontFamily]);

	return null;
}
