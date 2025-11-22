/**
 * Electron Builder Configuration
 * @see https://www.electron.build/configuration/configuration
 */

import { join } from "node:path";
import type { Configuration } from "electron-builder";
import pkg from "./package.json";

const currentYear = new Date().getFullYear();
const author = pkg.author?.name ?? pkg.author;
const authorInKebabCase = author.replace(/\s+/g, "-");
const appId = `com.${authorInKebabCase}.${pkg.name}`.toLowerCase();

const config: Configuration = {
	appId,
	productName: pkg.displayName,
	copyright: `Copyright © ${currentYear} — ${author}`,
	electronVersion: pkg.devDependencies.electron.replace(/^\^/, ""),

	// Directories
	directories: {
		output: "release",
		buildResources: join(pkg.resources, "build"),
	},

	files: [
		"dist/**/*",
		"package.json",
		{
			from: pkg.resources,
			to: "resources",
			filter: ["**/*"],
		},
		"!node_modules/@superset/**/*",
	],

	// Build optimization
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
				arch: ["universal"],
			},
		],
		hardenedRuntime: true,
		gatekeeperAssess: false,
		entitlements: join(pkg.resources, "build/entitlements.mac.plist"),
		entitlementsInherit: join(
			pkg.resources,
			"build/entitlements.mac.inherit.plist",
		),
		// notarize: {
		// 	teamId: "2HVBK29S3C",
		// 	keychainProfile: "AC_PASSWORD",
		// },
	},

	// Deep linking protocol
	protocols: {
		name: pkg.displayName,
		schemes: ["superset"],
	},

	// Linux
	linux: {
		icon: join(pkg.resources, "build/icons"),
		category: "Utility",
		synopsis: pkg.description,
		target: ["AppImage", "deb"],
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
	},

	// NSIS installer (Windows)
	nsis: {
		oneClick: false,
		allowToChangeInstallationDirectory: true,
	},
};

export default config;
