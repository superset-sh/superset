/**
 * Derives paste-primary mode from CLI args and browser-availability decision.
 * Either an explicit --no-browser flag OR an auto-detected cross-device context
 * forces paste-primary mode. (AC-10)
 */
export function derivePasteOnly(
	args: { noBrowser?: boolean },
	browserAvailable: boolean,
): boolean {
	return Boolean(args.noBrowser) || !browserAvailable;
}
