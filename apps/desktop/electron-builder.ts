/**
 * Electron Builder Configuration
 * @see https://www.electron.build/configuration/configuration
 */

import { join } from "node:path";
import type { Configuration } from "electron-builder";
import pkg from "./package.json";

const currentYear = new Date().getFullYear();
const author = pkg.author?.name ?? pkg.author;
const productName = pkg.productName;

const config: Configuration = {
	appId: "com.superset.desktop",
	productName,
	copyright: `Copyright © ${currentYear} — ${author}`,
	electronVersion: pkg.devDependencies.electron.replace(/^\^/, ""),

	// Generate latest-mac.yml for auto-update (workflow handles actual upload)
	publish: {
		provider: "github",
		owner: "superset-sh",
		repo: "superset",
	},

	// Directories
	directories: {
		output: "release",
		buildResources: join(pkg.resources, "build"),
	},

	// ASAR configuration for native modules and external resources
	asar: true,
	asarUnpack: [
		"**/node_modules/node-pty/**/*",
		// Sound files must be unpacked so external audio players (afplay, paplay, etc.) can access them
		"**/resources/sounds/**/*",
	],

	files: [
		"dist/**/*",
		"package.json",
		{
			from: pkg.resources,
			to: "resources",
			filter: ["**/*"],
		},
		// Native module that can't be bundled by Vite.
		// The copy:native-modules script replaces symlinks with real files
		// before building (required for Bun 1.3+ isolated installs).
		{
			from: "node_modules/node-pty",
			to: "node_modules/node-pty",
			filter: ["**/*"],
		},
		"!**/.DS_Store",
	],

	// Skip npm rebuild - dependencies already built in monorepo
	npmRebuild: false,
	buildDependenciesFromSource: false,
	nodeGypRebuild: false,

	// macOS
	mac: {
		icon: join(pkg.resources, "build/icons/icon.icns"),
		category: "public.app-category.utilities",
		target: [
			{
				target: "default",
				arch: ["arm64"],
			},
		],
		hardenedRuntime: true,
		gatekeeperAssess: false,
		notarize: true,
		extendInfo: {
			CFBundleName: productName,
			CFBundleDisplayName: productName,
		},
	},

	// Deep linking protocol
	protocols: {
		name: productName,
		schemes: ["superset"],
	},

	// Linux
	linux: {
		icon: join(pkg.resources, "build/icons"),
		category: "Utility",
		synopsis: pkg.description,
		target: ["AppImage", "deb"],
		artifactName: `superset-\${version}-\${arch}.\${ext}`,
	},

	// Windows
	win: {
		icon: join(pkg.resources, "build/icons/icon.ico"),
		target: [
			{
				target: "nsis",
				arch: ["x64"],
			},
		],
		artifactName: `${productName}-${pkg.version}-\${arch}.\${ext}`,
	},

	// NSIS installer (Windows)
	nsis: {
		oneClick: false,
		allowToChangeInstallationDirectory: true,
	},
};

export default config;
