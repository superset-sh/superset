/**
 * Test script to simulate multiple update-downloaded events firing rapidly
 *
 * Usage:
 * 1. Import this in main/index.ts temporarily: import '.lib/__test-updater'
 * 2. Run the app in dev mode
 * 3. Check console logs to verify guards are working
 */

import { autoUpdater } from "electron-updater";

export function simulateMultipleUpdateEvents() {
	console.log("[test-updater] Simulating 5 rapid update-downloaded events...");

	const mockUpdateInfo = {
		version: "0.0.99-test",
		files: [],
		path: "",
		sha512: "",
		releaseDate: new Date().toISOString(),
	};

	// Fire 5 update-downloaded events rapidly (simulating race condition)
	for (let i = 0; i < 5; i++) {
		setTimeout(() => {
			console.log(`[test-updater] Emitting update-downloaded event #${i + 1}`);
			autoUpdater.emit("update-downloaded", mockUpdateInfo);
		}, i * 50); // 50ms apart
	}
}

// Auto-run after 5 seconds
setTimeout(() => {
	simulateMultipleUpdateEvents();
}, 5000);
