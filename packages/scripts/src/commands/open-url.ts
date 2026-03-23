import { openDeepLink } from "../lib/deep-link.js";
import { error, info } from "../lib/output.js";

const APP_DOMAIN = "app.superset.sh";

export function openUrlCommand(args: string[]): void {
	const url = args[0];
	if (!url) {
		error("Usage: superset open <url>");
		process.exit(1);
	}

	if (url.startsWith("superset://")) {
		const path = url.replace("superset://", "");
		openDeepLink(path);
		info("Opening in Superset...");
		return;
	}

	try {
		const parsed = new URL(url);
		if (parsed.protocol === "https:" && parsed.hostname === APP_DOMAIN) {
			const path = parsed.pathname.slice(1) + parsed.search + parsed.hash;
			openDeepLink(path);
			info("Opening in Superset...");
			return;
		}
	} catch (e) {
		error(`Invalid URL: ${e instanceof Error ? e.message : String(e)}`);
		process.exit(1);
	}

	error(
		`Unsupported URL. Provide a superset:// or https://${APP_DOMAIN}/ URL.`,
	);
	process.exit(1);
}
