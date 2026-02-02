import type { IconType } from "react-icons";
import {
	VscFile,
	VscFileCode,
	VscFileMedia,
	VscFilePdf,
	VscFileZip,
	VscFolder,
	VscFolderOpened,
	VscGear,
	VscJson,
	VscLock,
	VscMarkdown,
	VscPackage,
	VscSourceControl,
	VscSymbolMisc,
	VscTerminalBash,
} from "react-icons/vsc";
import {
	SiCss3,
	SiDocker,
	SiGo,
	SiHtml5,
	SiJavascript,
	SiPython,
	SiReact,
	SiRust,
	SiTypescript,
	SiYaml,
} from "react-icons/si";

interface FileIconConfig {
	icon: IconType;
	color: string;
}

const EXTENSION_ICONS: Record<string, FileIconConfig> = {
	// TypeScript
	ts: { icon: SiTypescript, color: "text-blue-500" },
	tsx: { icon: SiReact, color: "text-cyan-400" },
	mts: { icon: SiTypescript, color: "text-blue-500" },
	cts: { icon: SiTypescript, color: "text-blue-500" },
	"d.ts": { icon: SiTypescript, color: "text-blue-400" },

	// JavaScript
	js: { icon: SiJavascript, color: "text-yellow-400" },
	jsx: { icon: SiReact, color: "text-cyan-400" },
	mjs: { icon: SiJavascript, color: "text-yellow-400" },
	cjs: { icon: SiJavascript, color: "text-yellow-400" },

	// Web
	html: { icon: SiHtml5, color: "text-orange-500" },
	htm: { icon: SiHtml5, color: "text-orange-500" },
	css: { icon: SiCss3, color: "text-blue-500" },
	scss: { icon: SiCss3, color: "text-pink-500" },
	sass: { icon: SiCss3, color: "text-pink-500" },
	less: { icon: SiCss3, color: "text-purple-500" },

	// Data formats
	json: { icon: VscJson, color: "text-yellow-500" },
	jsonc: { icon: VscJson, color: "text-yellow-500" },
	yaml: { icon: SiYaml, color: "text-red-400" },
	yml: { icon: SiYaml, color: "text-red-400" },
	toml: { icon: VscGear, color: "text-gray-400" },
	xml: { icon: VscFileCode, color: "text-orange-400" },
	csv: { icon: VscSymbolMisc, color: "text-green-500" },

	// Documentation
	md: { icon: VscMarkdown, color: "text-blue-400" },
	mdx: { icon: VscMarkdown, color: "text-orange-400" },
	txt: { icon: VscFile, color: "text-muted-foreground" },
	rst: { icon: VscFile, color: "text-muted-foreground" },
	pdf: { icon: VscFilePdf, color: "text-red-500" },

	// Python
	py: { icon: SiPython, color: "text-yellow-500" },
	pyw: { icon: SiPython, color: "text-yellow-500" },
	pyi: { icon: SiPython, color: "text-blue-400" },

	// Rust
	rs: { icon: SiRust, color: "text-orange-500" },

	// Go
	go: { icon: SiGo, color: "text-cyan-500" },

	// Shell
	sh: { icon: VscTerminalBash, color: "text-green-500" },
	bash: { icon: VscTerminalBash, color: "text-green-500" },
	zsh: { icon: VscTerminalBash, color: "text-green-500" },
	fish: { icon: VscTerminalBash, color: "text-green-500" },

	// Images
	png: { icon: VscFileMedia, color: "text-purple-400" },
	jpg: { icon: VscFileMedia, color: "text-purple-400" },
	jpeg: { icon: VscFileMedia, color: "text-purple-400" },
	gif: { icon: VscFileMedia, color: "text-purple-400" },
	svg: { icon: VscFileMedia, color: "text-yellow-500" },
	webp: { icon: VscFileMedia, color: "text-purple-400" },
	ico: { icon: VscFileMedia, color: "text-purple-400" },

	// Video
	mp4: { icon: VscFileMedia, color: "text-pink-500" },
	webm: { icon: VscFileMedia, color: "text-pink-500" },
	mov: { icon: VscFileMedia, color: "text-pink-500" },
	avi: { icon: VscFileMedia, color: "text-pink-500" },

	// Audio
	mp3: { icon: VscFileMedia, color: "text-red-400" },
	wav: { icon: VscFileMedia, color: "text-red-400" },
	ogg: { icon: VscFileMedia, color: "text-red-400" },
	flac: { icon: VscFileMedia, color: "text-red-400" },

	// Archives
	zip: { icon: VscFileZip, color: "text-yellow-600" },
	tar: { icon: VscFileZip, color: "text-yellow-600" },
	gz: { icon: VscFileZip, color: "text-yellow-600" },
	"7z": { icon: VscFileZip, color: "text-yellow-600" },
	rar: { icon: VscFileZip, color: "text-yellow-600" },

	// Database
	sql: { icon: VscSymbolMisc, color: "text-blue-400" },
	sqlite: { icon: VscSymbolMisc, color: "text-blue-400" },
	db: { icon: VscSymbolMisc, color: "text-blue-400" },

	// Docker
	dockerfile: { icon: SiDocker, color: "text-blue-500" },

	// Config files
	env: { icon: VscLock, color: "text-yellow-500" },
	"env.local": { icon: VscLock, color: "text-yellow-500" },
	"env.development": { icon: VscLock, color: "text-yellow-500" },
	"env.production": { icon: VscLock, color: "text-yellow-500" },
	gitignore: { icon: VscSourceControl, color: "text-orange-500" },
	gitattributes: { icon: VscSourceControl, color: "text-orange-500" },
	editorconfig: { icon: VscGear, color: "text-muted-foreground" },
	prettierrc: { icon: VscGear, color: "text-pink-400" },
	eslintrc: { icon: VscGear, color: "text-purple-400" },
};

const FILENAME_ICONS: Record<string, FileIconConfig> = {
	"package.json": { icon: VscPackage, color: "text-green-500" },
	"package-lock.json": { icon: VscPackage, color: "text-red-400" },
	"bun.lockb": { icon: VscPackage, color: "text-amber-200" },
	"bun.lock": { icon: VscPackage, color: "text-amber-200" },
	"yarn.lock": { icon: VscPackage, color: "text-blue-400" },
	"pnpm-lock.yaml": { icon: VscPackage, color: "text-orange-500" },
	Dockerfile: { icon: SiDocker, color: "text-blue-500" },
	"docker-compose.yml": { icon: SiDocker, color: "text-blue-500" },
	"docker-compose.yaml": { icon: SiDocker, color: "text-blue-500" },
	".gitignore": { icon: VscSourceControl, color: "text-orange-500" },
	".gitattributes": { icon: VscSourceControl, color: "text-orange-500" },
	".env": { icon: VscLock, color: "text-yellow-500" },
	".env.local": { icon: VscLock, color: "text-yellow-500" },
	".env.development": { icon: VscLock, color: "text-yellow-500" },
	".env.production": { icon: VscLock, color: "text-yellow-500" },
	"tsconfig.json": { icon: SiTypescript, color: "text-blue-500" },
	"jsconfig.json": { icon: SiJavascript, color: "text-yellow-400" },
	README: { icon: VscMarkdown, color: "text-blue-400" },
	"README.md": { icon: VscMarkdown, color: "text-blue-400" },
	LICENSE: { icon: VscFile, color: "text-yellow-500" },
	"LICENSE.md": { icon: VscFile, color: "text-yellow-500" },
	"biome.json": { icon: VscGear, color: "text-blue-400" },
	"turbo.json": { icon: VscGear, color: "text-pink-500" },
	".prettierrc": { icon: VscGear, color: "text-pink-400" },
	".eslintrc": { icon: VscGear, color: "text-purple-400" },
	".eslintrc.json": { icon: VscGear, color: "text-purple-400" },
	".eslintrc.js": { icon: VscGear, color: "text-purple-400" },
};

const FOLDER_ICONS: Record<string, FileIconConfig> = {
	node_modules: { icon: VscPackage, color: "text-green-600" },
	".git": { icon: VscSourceControl, color: "text-orange-500" },
	src: { icon: VscFolder, color: "text-blue-500" },
	dist: { icon: VscFolder, color: "text-yellow-600" },
	build: { icon: VscFolder, color: "text-yellow-600" },
	public: { icon: VscFolder, color: "text-green-500" },
	assets: { icon: VscFolder, color: "text-purple-500" },
	components: { icon: VscFolder, color: "text-cyan-500" },
	lib: { icon: VscFolder, color: "text-orange-500" },
	utils: { icon: VscFolder, color: "text-pink-500" },
	hooks: { icon: VscFolder, color: "text-purple-500" },
	styles: { icon: VscFolder, color: "text-pink-500" },
	tests: { icon: VscFolder, color: "text-green-500" },
	__tests__: { icon: VscFolder, color: "text-green-500" },
	docs: { icon: VscFolder, color: "text-blue-500" },
	app: { icon: VscFolder, color: "text-blue-500" },
	apps: { icon: VscFolder, color: "text-blue-500" },
	packages: { icon: VscFolder, color: "text-purple-500" },
	config: { icon: VscFolder, color: "text-gray-400" },
	scripts: { icon: VscFolder, color: "text-green-500" },
	types: { icon: VscFolder, color: "text-blue-400" },
	api: { icon: VscFolder, color: "text-green-500" },
	pages: { icon: VscFolder, color: "text-blue-500" },
};

export function getFileIcon(
	fileName: string,
	isDirectory: boolean,
	isOpen = false,
): FileIconConfig {
	if (isDirectory) {
		const folderIcon = FOLDER_ICONS[fileName];
		if (folderIcon) {
			return {
				icon: isOpen ? VscFolderOpened : folderIcon.icon,
				color: folderIcon.color,
			};
		}
		return {
			icon: isOpen ? VscFolderOpened : VscFolder,
			color: "text-amber-500",
		};
	}

	const filenameIcon = FILENAME_ICONS[fileName];
	if (filenameIcon) {
		return filenameIcon;
	}

	const extension = getExtension(fileName);
	if (extension) {
		const extIcon = EXTENSION_ICONS[extension];
		if (extIcon) {
			return extIcon;
		}
	}

	return {
		icon: VscFile,
		color: "text-muted-foreground",
	};
}

function getExtension(fileName: string): string | null {
	if (fileName.endsWith(".d.ts")) {
		return "d.ts";
	}
	if (fileName.endsWith(".env.local")) {
		return "env.local";
	}
	if (fileName.endsWith(".env.development")) {
		return "env.development";
	}
	if (fileName.endsWith(".env.production")) {
		return "env.production";
	}

	const parts = fileName.split(".");
	if (parts.length > 1) {
		return parts[parts.length - 1].toLowerCase();
	}

	return null;
}
