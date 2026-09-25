import { electronTrpc } from "renderer/lib/electron-trpc";
import { DEFAULT_BROWSER_URL } from "../usePaneRegistry/components/BrowserPane/constants";

/**
 * The URL a newly opened browser pane should load: the user's configured
 * homepage (Settings → Browser), or {@link DEFAULT_BROWSER_URL} when unset.
 */
export function useDefaultBrowserUrl(): string {
	const { data } = electronTrpc.settings.getBrowserHomepageUrl.useQuery();
	return data && data.length > 0 ? data : DEFAULT_BROWSER_URL;
}
