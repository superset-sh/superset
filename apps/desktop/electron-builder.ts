/**
 * Electron Builder Configuration
 * @see https://www.electron.build/configuration/configuration
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Configuration } from "electron-builder";
import pkg from "./package.json";

const currentYear = new Date().getFullYear();
const author = pkg.author?.name ?? pkg.author;
const productName = pkg.productName;
const macIconPath = join(pkg.resources, "build/icons/icon.icns");
const linuxIconPath = join(pkg.resources, "build/icons");
const winIconPath = join(pkg.resources, "build/icons/icon.ico");

const config: Configuration = {
	appId: "com.superset.desktop",
	productName,
	copyright: `Copyright © ${currentYear} — ${author}`,
	electronVersion: pkg.devDependencies.electron.replace(/^\^/, ""),

	// Generate update manifests for all channels (latest.yml, canary.yml, etc.)
	// This enables proper channel-based auto-updates following electron-builder conventions
	generateUpdatesFilesForAllChannels: true,

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
		"**/node_modules/better-sqlite3/**/*",
		// better-sqlite3 uses `bindings` to locate native modules - must be unpacked together
		"**/node_modules/bindings/**/*",
		"**/node_modules/file-uri-to-path/**/*",
		"**/node_modules/node-pty/**/*",
		// Sound files must be unpacked so external audio players (afplay, paplay, etc.) can access them
		"**/resources/sounds/**/*",
		// Tray icon must be unpacked so Electron Tray can load it
		"**/resources/tray/**/*",
	],

	// Extra resources placed outside asar archive (accessible via process.resourcesPath)
	extraResources: [
		// Database migrations - must be outside asar for drizzle-orm to read
		{
			from: "dist/resources/migrations",
			to: "resources/migrations",
			filter: ["**/*"],
		},
	],

	files: [
		"dist/**/*",
		"package.json",
		{
			from: pkg.resources,
			to: "resources",
			filter: ["**/*"],
		},
		// Native modules that can't be bundled by Vite.
		// bun creates symlinks for direct deps in workspace node_modules.
		// The copy:native-modules script replaces symlinks with real files
		// before building (required for Bun 1.3+ isolated installs).
		{
			from: "node_modules/better-sqlite3",
			to: "node_modules/better-sqlite3",
			filter: ["**/*"],
		},
		// better-sqlite3 uses `bindings` package to locate its native .node file
		{
			from: "node_modules/bindings",
			to: "node_modules/bindings",
			filter: ["**/*"],
		},
		// `bindings` requires `file-uri-to-path` for file:// URL handling
		{
			from: "node_modules/file-uri-to-path",
			to: "node_modules/file-uri-to-path",
			filter: ["**/*"],
		},
		{
			from: "node_modules/node-pty",
			to: "node_modules/node-pty",
			filter: ["**/*"],
		},
		// friendly-words is a CommonJS module that Vite doesn't bundle
		{
			from: "node_modules/friendly-words",
			to: "node_modules/friendly-words",
			filter: ["**/*"],
		},
		"!**/.DS_Store",
	],

	// Rebuild native modules for Electron's Node.js version
	npmRebuild: true,

	// macOS
	mac: {
		...(existsSync(macIconPath) ? { icon: macIconPath } : {}),
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
		entitlements: join(pkg.resources, "build/entitlements.mac.plist"),
		entitlementsInherit: join(
			pkg.resources,
			"build/entitlements.mac.inherit.plist",
		),
		extendInfo: {
			CFBundleName: productName,
			CFBundleDisplayName: productName,
			// Required for macOS local network permission prompt
			NSLocalNetworkUsageDescription:
				"Superset needs access to your local network to discover and connect to development servers running on your network.",
			// Bonjour service types to browse for (triggers the permission prompt)
			NSBonjourServices: ["_http._tcp", "_https._tcp"],
			// Required for Apple Events / Automation permission prompt
			NSAppleEventsUsageDescription:
				"Superset needs to interact with other applications to run terminal commands and development tools.",
		},
	},

	// Deep linking protocol
	protocols: {
		name: productName,
		schemes: ["superset"],
	},

	// Linux
	linux: {
		...(existsSync(linuxIconPath) ? { icon: linuxIconPath } : {}),
		category: "Utility",
		synopsis: pkg.description,
		target: ["AppImage"],
		artifactName: `superset-\${version}-\${arch}.\${ext}`,
	},

	// Windows
	win: {
		...(existsSync(winIconPath) ? { icon: winIconPath } : {}),
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
