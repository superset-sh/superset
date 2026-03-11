import { openDeepLink } from "../lib/deep-link.js";
import { info } from "../lib/output.js";

export function loginCommand(): void {
	openDeepLink("auth/login");
	info("Opening login in Superset...");
}
