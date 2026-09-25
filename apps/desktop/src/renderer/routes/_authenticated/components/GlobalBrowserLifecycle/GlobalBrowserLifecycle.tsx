import { useBrowserOpenRequests } from "./hooks/useBrowserOpenRequests";
import { useGlobalBrowserLifecycle } from "./hooks/useGlobalBrowserLifecycle";

export function GlobalBrowserLifecycle() {
	useGlobalBrowserLifecycle();
	useBrowserOpenRequests();
	return null;
}
