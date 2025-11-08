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

	directories: {
		app: dirname(main),
		output: `dist/v${version}`,
	},

	npmRebuild: false,
	buildDependenciesFromSource: false,
	nodeGypRebuild: false,

	mac: {
		artifactName,
		icon: `${resources}/build/icons/icon.icns`,
		category: "public.app-category.utilities",
		target: ["zip", "dmg", "dir"],
		notarize: false,
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
