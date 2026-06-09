import { accessSync, constants } from "node:fs";
import { resolve } from "node:path";

const targetPlatform = process.env.TARGET_PLATFORM ?? process.platform;
const outfile = resolve(
	import.meta.dirname,
	"..",
	"dist/resources/bin",
	targetPlatform === "win32" ? "superset.exe" : "superset",
);

function hasExecutableCli(): boolean {
	try {
		accessSync(
			outfile,
			targetPlatform === "win32" ? constants.F_OK : constants.X_OK,
		);
		return true;
	} catch {
		return false;
	}
}

if (hasExecutableCli()) {
	console.log(`[desktop] bundled CLI already exists at ${outfile}`);
} else {
	console.log("[desktop] bundled CLI missing; building it now");
	await import("./build-bundled-cli");
}
