import { AlertCircleIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GENERIC_FAMILIES, parsePrimaryFamily } from "../../../../font-utils";

/**
 * Canvas-based font availability check.
 * Measures text with the target font against a known fallback — if the widths
 * differ, the font is installed.
 */
function isFontInstalled(family: string): boolean {
	if (GENERIC_FAMILIES.has(family.toLowerCase())) return true;

	try {
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");
		if (!ctx) return true; // Can't measure — assume installed

		const testString = "mmmmmmmmmmlli10OQ@#$%";
		const fallbacks = ["monospace", "sans-serif"] as const;

		for (const fallback of fallbacks) {
			ctx.font = `72px ${fallback}`;
			const fallbackWidth = ctx.measureText(testString).width;

			ctx.font = `72px "${family}", ${fallback}`;
			const testWidth = ctx.measureText(testString).width;

			if (Math.abs(testWidth - fallbackWidth) > 0.5) {
				return true;
			}
		}
		return false;
	} catch (err) {
		console.warn(
			`[FontNotFoundBanner] Failed to check availability for "${family}":`,
			err,
		);
		return true; // Can't determine — assume installed
	}
}

export function FontNotFoundBanner({ fontFamily }: { fontFamily: string }) {
	const primaryFont = useMemo(
		() => parsePrimaryFamily(fontFamily),
		[fontFamily],
	);

	const [available, setAvailable] = useState<boolean | null>(null);

	useEffect(() => {
		if (!primaryFont) {
			setAvailable(true);
			return;
		}

		// Reset immediately so we don't show a stale banner while re-checking
		setAvailable(null);

		// Use rAF to ensure @font-face fonts have a chance to load
		const raf = requestAnimationFrame(() => {
			setAvailable(isFontInstalled(primaryFont));
		});
		return () => cancelAnimationFrame(raf);
	}, [primaryFont]);

	// Don't show banner while checking or if font is available
	if (available !== false || !primaryFont) return null;

	return (
		<div className="flex items-center gap-2 px-3 py-2 text-xs border-t border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400">
			<AlertCircleIcon className="size-3.5 shrink-0" />
			<span>
				<strong>{primaryFont}</strong> is not installed on this system. Falling
				back to the next available font.
			</span>
		</div>
	);
}
