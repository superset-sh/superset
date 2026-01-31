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

	publish: {
		provider: "github",
		owner: "superset-sh",
		repo: "superset",
		releaseType: "prerelease",
	},

	mac: {
		...baseConfig.mac,
		icon: join(pkg.resources, "build/icons/icon-canary.icns"),
		artifactName: `Superset-Canary-\${version}-\${arch}.\${ext}`,
		extendInfo: {
			...baseConfig.mac?.extendInfo,
			CFBundleName: productName,
			CFBundleDisplayName: productName,
		},
	},

	linux: {
		...baseConfig.linux,
		icon: join(pkg.resources, "build/icons/icon-canary.png"),
		synopsis: `${pkg.description} (Canary)`,
		artifactName: `superset-canary-\${version}-\${arch}.\${ext}`,
	},

	win: {
		...baseConfig.win,
		icon: join(pkg.resources, "build/icons/icon-canary.ico"),
		artifactName: `Superset-Canary-\${version}-\${arch}.\${ext}`,
	},
};

export default config;
