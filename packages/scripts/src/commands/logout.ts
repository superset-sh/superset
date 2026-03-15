import { openDeepLink } from "../lib/deep-link.js";
import { info } from "../lib/output.js";

export function logoutCommand(): void {
	openDeepLink("auth/logout");
	info("Logging out of Superset...");
}
