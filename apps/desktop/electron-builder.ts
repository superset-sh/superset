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

	// ASAR configuration for native modules
	asar: true,
	asarUnpack: [
		"**/node_modules/node-pty/**/*",
	],

	files: [
		"dist/**/*",
		"package.json",
		{
			from: pkg.resources,
			to: "resources",
			filter: ["**/*"],
		},
		// Include specific production dependencies from monorepo root
		{
			from: "../../node_modules/node-pty",
			to: "node_modules/node-pty",
			filter: ["**/*"],
		},
		"!node_modules/@superset/**/*",
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
				arch: ["universal"],
			},
		],
		hardenedRuntime: true,
		gatekeeperAssess: false,
		notarize: false,
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
