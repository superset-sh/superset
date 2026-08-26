import { createDismissalsStore } from "renderer/stores/createDismissalsStore";

/**
 * Dismissal for the browser pane's "import from Chrome" banner. A single
 * app-wide id (not per pane): dismissing the nag in one pane should silence
 * it everywhere, and it must survive remounts — the pane component is reused
 * unkeyed across tab switches, so component-local state both resets and
 * bleeds between panes.
 */
export const BROWSER_IMPORT_BANNER_ID = "browser-import-banner";

export const useBrowserImportBannerDismissalsStore = createDismissalsStore(
	"browser-import-banner-dismissals-v1",
	"BrowserImportBannerDismissals",
);
