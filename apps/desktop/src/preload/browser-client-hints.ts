import { contextBridge } from "electron";
import {
	buildUserAgentDataOverride,
	type UserAgentDataOverride,
} from "shared/client-hints";

/**
 * Session preload for the browser pane (registered in
 * main/lib/browser/user-agent.ts), running at document-start in every frame.
 * Rewriting the `sec-ch-ua*` headers doesn't change what page JS reads from
 * `navigator.userAgentData` — Chromium builds that from the same metadata
 * `setUserAgent()` can't touch, so scripts would still see a brand list with
 * no "Google Chrome" entry contradicting the UA string. Replace it in the
 * main world before any page script can read it.
 */

const override = buildUserAgentDataOverride({
	chromeVersion: process.versions.chrome,
	platform: process.platform,
	arch: process.arch,
	osVersion: process.getSystemVersion(),
});

contextBridge.executeInMainWorld({
	// Serialized and re-executed in the page's world: only `data` and globals
	// are in scope here.
	func: (data: UserAgentDataOverride) => {
		// Real Chrome exposes navigator.userAgentData only in secure contexts.
		if (!globalThis.isSecureContext) return;
		const uaData = {
			brands: data.brands,
			mobile: data.mobile,
			platform: data.platform,
			getHighEntropyValues: async (_hints?: string[]) => ({
				brands: data.brands,
				mobile: data.mobile,
				...data.highEntropy,
			}),
			toJSON: () => ({
				brands: data.brands,
				mobile: data.mobile,
				platform: data.platform,
			}),
		};
		// Redefine the prototype accessor (where the real property lives)
		// rather than adding an own property to the navigator instance.
		Object.defineProperty(Navigator.prototype, "userAgentData", {
			get: () => uaData,
			configurable: true,
			enumerable: true,
		});
	},
	args: [override],
});
