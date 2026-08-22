import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

/**
 * The network logger (Electric-era sync debugging) wrote Chromium netlogs to
 * userData/network-logs — up to 4GB per profile, with sensitive capture on.
 * The writer is deleted; this sweep reclaims the stranded directories.
 */
export function sweepNetworkLogs(): void {
	const dir = path.join(app.getPath("userData"), "network-logs");
	fs.rm(dir, { recursive: true, force: true }, (error) => {
		if (error) console.warn("[main] network-logs sweep failed:", error);
	});
}
