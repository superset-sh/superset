import { AlertCircleIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GENERIC_FAMILIES, parsePrimaryFamily } from "../../../../font-utils";

/**
 * Async font availability check.
 * Forces the browser to load the font via document.fonts.load() (triggers
 * @font-face fetch), then verifies with document.fonts.check().
 */
async function checkFontAvailable(family: string): Promise<boolean> {
	if (GENERIC_FAMILIES.has(family.toLowerCase())) return true;

	try {
		// Force-load the font (triggers @font-face if registered)
		await document.fonts.load(`16px "${family}"`);
		// After loading, check() is reliable
		return document.fonts.check(`16px "${family}"`);
	} catch {
		return false;
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

		let cancelled = false;
		checkFontAvailable(primaryFont).then((result) => {
			if (!cancelled) setAvailable(result);
		});
		return () => {
			cancelled = true;
		};
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
