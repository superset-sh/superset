import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Configuration } from "electron-builder";
import baseConfig from "./electron-builder";
import pkg from "./package.json";

const productName = "Superedset";
const iconPath = join(pkg.resources, "build/icons/icon-canary.icns");

const config: Configuration = {
	...baseConfig,
	appId: "com.theblondealex.superedset",
	productName,
	extraMetadata: { productName },
	publish: {
		provider: "github",
		owner: "theblondealex",
		repo: "superset",
		releaseType: "prerelease",
		updaterCacheDirName: "@superedsetdesktop-updater",
	},
	protocols: {
		name: productName,
		schemes: ["superedset"],
	},
	mac: {
		...baseConfig.mac,
		...(existsSync(iconPath) ? { icon: iconPath } : {}),
		artifactName: `Superedset-\${version}-\${arch}.\${ext}`,
		extendInfo: {
			...baseConfig.mac?.extendInfo,
			CFBundleName: productName,
			CFBundleDisplayName: productName,
		},
	},
};

export default config;
