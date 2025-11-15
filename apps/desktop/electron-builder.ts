/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: <> */

import { dirname } from "node:path";
import type { Configuration } from "electron-builder";

import {
	author as _author,
	description,
	displayName,
	main,
	name,
	resources,
	version,
} from "./package.json";

const author = _author?.name ?? _author;
const currentYear = new Date().getFullYear();
const authorInKebabCase = author.replace(/\s+/g, "-");
const appId = `com.${authorInKebabCase}.${name}`.toLowerCase();

const artifactName = [`${name}-v${version}`, "-${os}.${ext}"].join("");

export default {
	appId,
	productName: displayName,
	copyright: `Copyright © ${currentYear} — ${author}`,
	electronVersion: "39.1.2",

	directories: {
		output: `dist/v${version}`,
		buildResources: "src/resources"
	},

	files: [
		"node_modules/.dev/**/*",
		{
			from: "../../node_modules/node-pty",
			to: "node_modules/node-pty"
		}
	],

	asarUnpack: [
		"node_modules/node-pty/**/*"
	],

	npmRebuild: false,
	buildDependenciesFromSource: false,
	nodeGypRebuild: false,

	extraMetadata: {
		name: displayName,
		version,
		main: "./node_modules/.dev/main/index.js",
		dependencies: {
			"node-pty": "1.1.0-beta30"
		}
	},

	mac: {
		artifactName,
		icon: `${resources}/build/icons/icon.icns`,
		category: "public.app-category.utilities",
		target: ["zip", "dmg", "dir"],
		notarize: false,
	},

	protocols: {
		name: displayName,
		schemes: ["superset"],
	},

	linux: {
		artifactName,
		category: "Utilities",
		synopsis: description,
		target: ["AppImage", "deb", "pacman", "freebsd", "rpm"],
	},

	win: {
		artifactName,
		icon: `${resources}/build/icons/icon.ico`,
		target: ["zip", "portable"],
	},
} satisfies Configuration;
