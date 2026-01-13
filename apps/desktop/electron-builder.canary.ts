/**
 * Electron Builder Configuration - Canary Build
 *
 * Extends the base config with canary-specific overrides for internal testing.
 * Can be installed side-by-side with the stable release.
 *
 * @see https://www.electron.build/configuration/configuration
 */

import { join } from "node:path";
import type { Configuration } from "electron-builder";
import baseConfig from "./electron-builder";
import pkg from "./package.json";

const productName = "Superset Canary";

const config: Configuration = {
	...baseConfig,
	appId: "com.superset.desktop.canary",
	productName,

	// Use GitHub provider for prerelease
	// Note: We override with setFeedURL in auto-updater.ts using generic provider,
	// so the actual update URL is determined at runtime based on version suffix
	publish: {
		provider: "github",
		owner: "superset-sh",
		repo: "superset",
		releaseType: "prerelease",
	},

	// macOS overrides
	mac: {
		...baseConfig.mac,
		icon: join(pkg.resources, "build/icons/icon-canary.icns"),
		extendInfo: {
			CFBundleName: productName,
			CFBundleDisplayName: productName,
		},
	},

	// Deep linking protocol - use different scheme for canary
	protocols: {
		name: productName,
		schemes: ["superset-canary"],
	},

	// Linux overrides
	linux: {
		...baseConfig.linux,
		icon: join(pkg.resources, "build/icons/icon-canary.png"),
		synopsis: `${pkg.description} (Canary)`,
		artifactName: `superset-canary-\${version}-\${arch}.\${ext}`,
	},

	// Windows overrides
	win: {
		...baseConfig.win,
		icon: join(pkg.resources, "build/icons/icon-canary.ico"),
		artifactName: `${productName}-${pkg.version}-\${arch}.\${ext}`,
	},
};

export default config;
