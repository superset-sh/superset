import { useWindowChromeEnabled } from "../../../WindowChromeScope";
import { useCollapsedSidebarBand } from "../useCollapsedSidebarBand";

/** True for the leftmost header while the sidebar is collapsed to its rail. */
export function useWindowChromeVisible(): boolean {
	const isEnabled = useWindowChromeEnabled();
	const isBanded = useCollapsedSidebarBand();
	return isEnabled && isBanded;
}
