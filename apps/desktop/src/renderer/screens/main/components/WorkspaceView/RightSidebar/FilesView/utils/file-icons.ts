import type { IconType } from "react-icons";
import {
	LuDatabase,
	LuFile,
	LuFileArchive,
	LuFileAudio,
	LuFileCode,
	LuFileImage,
	LuFileJson,
	LuFileSpreadsheet,
	LuFileText,
	LuFileVideo,
	LuFolder,
	LuFolderOpen,
	LuGitBranch,
	LuLock,
	LuPackage,
	LuSettings,
	LuTerminal,
} from "react-icons/lu";
import {
	SiCss3,
	SiDocker,
	SiGo,
	SiHtml5,
	SiJavascript,
	SiMarkdown,
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
	tsx: { icon: SiReact, color: "text-cyan-500" },
	mts: { icon: SiTypescript, color: "text-blue-500" },
	cts: { icon: SiTypescript, color: "text-blue-500" },
	"d.ts": { icon: SiTypescript, color: "text-blue-400" },

	// JavaScript
	js: { icon: SiJavascript, color: "text-yellow-500" },
	jsx: { icon: SiReact, color: "text-cyan-500" },
	mjs: { icon: SiJavascript, color: "text-yellow-500" },
	cjs: { icon: SiJavascript, color: "text-yellow-500" },

	// Web
	html: { icon: SiHtml5, color: "text-orange-500" },
	htm: { icon: SiHtml5, color: "text-orange-500" },
	css: { icon: SiCss3, color: "text-blue-400" },
	scss: { icon: SiCss3, color: "text-pink-500" },
	sass: { icon: SiCss3, color: "text-pink-500" },
	less: { icon: SiCss3, color: "text-purple-500" },

	// Data formats
	json: { icon: LuFileJson, color: "text-yellow-600" },
	jsonc: { icon: LuFileJson, color: "text-yellow-600" },
	yaml: { icon: SiYaml, color: "text-red-400" },
	yml: { icon: SiYaml, color: "text-red-400" },
	toml: { icon: LuSettings, color: "text-orange-400" },
	xml: { icon: LuFileCode, color: "text-orange-500" },
	csv: { icon: LuFileSpreadsheet, color: "text-green-500" },

	// Documentation
	md: { icon: SiMarkdown, color: "text-slate-400" },
	mdx: { icon: SiMarkdown, color: "text-yellow-400" },
	txt: { icon: LuFileText, color: "text-muted-foreground" },
	rst: { icon: LuFileText, color: "text-muted-foreground" },

	// Python
	py: { icon: SiPython, color: "text-blue-400" },
	pyw: { icon: SiPython, color: "text-blue-400" },
	pyi: { icon: SiPython, color: "text-blue-300" },

	// Rust
	rs: { icon: SiRust, color: "text-orange-600" },

	// Go
	go: { icon: SiGo, color: "text-cyan-400" },

	// Shell
	sh: { icon: LuTerminal, color: "text-green-400" },
	bash: { icon: LuTerminal, color: "text-green-400" },
	zsh: { icon: LuTerminal, color: "text-green-400" },
	fish: { icon: LuTerminal, color: "text-green-400" },

	// Images
	png: { icon: LuFileImage, color: "text-purple-400" },
	jpg: { icon: LuFileImage, color: "text-purple-400" },
	jpeg: { icon: LuFileImage, color: "text-purple-400" },
	gif: { icon: LuFileImage, color: "text-purple-400" },
	svg: { icon: LuFileImage, color: "text-orange-400" },
	webp: { icon: LuFileImage, color: "text-purple-400" },
	ico: { icon: LuFileImage, color: "text-purple-400" },

	// Video
	mp4: { icon: LuFileVideo, color: "text-pink-400" },
	webm: { icon: LuFileVideo, color: "text-pink-400" },
	mov: { icon: LuFileVideo, color: "text-pink-400" },
	avi: { icon: LuFileVideo, color: "text-pink-400" },

	// Audio
	mp3: { icon: LuFileAudio, color: "text-red-400" },
	wav: { icon: LuFileAudio, color: "text-red-400" },
	ogg: { icon: LuFileAudio, color: "text-red-400" },
	flac: { icon: LuFileAudio, color: "text-red-400" },

	// Archives
	zip: { icon: LuFileArchive, color: "text-yellow-500" },
	tar: { icon: LuFileArchive, color: "text-yellow-500" },
	gz: { icon: LuFileArchive, color: "text-yellow-500" },
	"7z": { icon: LuFileArchive, color: "text-yellow-500" },
	rar: { icon: LuFileArchive, color: "text-yellow-500" },

	// Database
	sql: { icon: LuDatabase, color: "text-blue-400" },
	sqlite: { icon: LuDatabase, color: "text-blue-400" },
	db: { icon: LuDatabase, color: "text-blue-400" },

	// Docker
	dockerfile: { icon: SiDocker, color: "text-blue-400" },

	// Config files
	env: { icon: LuLock, color: "text-yellow-500" },
	"env.local": { icon: LuLock, color: "text-yellow-500" },
	"env.development": { icon: LuLock, color: "text-yellow-500" },
	"env.production": { icon: LuLock, color: "text-yellow-500" },
	gitignore: { icon: LuGitBranch, color: "text-orange-400" },
	gitattributes: { icon: LuGitBranch, color: "text-orange-400" },
	editorconfig: { icon: LuSettings, color: "text-muted-foreground" },
	prettierrc: { icon: LuSettings, color: "text-pink-400" },
	eslintrc: { icon: LuSettings, color: "text-purple-400" },
};

const FILENAME_ICONS: Record<string, FileIconConfig> = {
	"package.json": { icon: LuPackage, color: "text-green-500" },
	"package-lock.json": { icon: LuPackage, color: "text-green-500" },
	"bun.lockb": { icon: LuPackage, color: "text-pink-400" },
	"yarn.lock": { icon: LuPackage, color: "text-blue-400" },
	"pnpm-lock.yaml": { icon: LuPackage, color: "text-yellow-500" },
	Dockerfile: { icon: SiDocker, color: "text-blue-400" },
	"docker-compose.yml": { icon: SiDocker, color: "text-blue-400" },
	"docker-compose.yaml": { icon: SiDocker, color: "text-blue-400" },
	".gitignore": { icon: LuGitBranch, color: "text-orange-400" },
	".gitattributes": { icon: LuGitBranch, color: "text-orange-400" },
	".env": { icon: LuLock, color: "text-yellow-500" },
	".env.local": { icon: LuLock, color: "text-yellow-500" },
	".env.development": { icon: LuLock, color: "text-yellow-500" },
	".env.production": { icon: LuLock, color: "text-yellow-500" },
	"tsconfig.json": { icon: SiTypescript, color: "text-blue-500" },
	"jsconfig.json": { icon: SiJavascript, color: "text-yellow-500" },
	README: { icon: SiMarkdown, color: "text-slate-400" },
	"README.md": { icon: SiMarkdown, color: "text-slate-400" },
	LICENSE: { icon: LuFileText, color: "text-yellow-500" },
	"LICENSE.md": { icon: LuFileText, color: "text-yellow-500" },
};

const FOLDER_ICONS: Record<string, FileIconConfig> = {
	node_modules: { icon: LuPackage, color: "text-green-500" },
	".git": { icon: LuGitBranch, color: "text-orange-400" },
	src: { icon: LuFolder, color: "text-blue-400" },
	dist: { icon: LuFolder, color: "text-yellow-500" },
	build: { icon: LuFolder, color: "text-yellow-500" },
	public: { icon: LuFolder, color: "text-green-400" },
	assets: { icon: LuFolder, color: "text-purple-400" },
	components: { icon: LuFolder, color: "text-cyan-400" },
	lib: { icon: LuFolder, color: "text-orange-400" },
	utils: { icon: LuFolder, color: "text-pink-400" },
	hooks: { icon: LuFolder, color: "text-purple-400" },
	styles: { icon: LuFolder, color: "text-pink-400" },
	tests: { icon: LuFolder, color: "text-green-400" },
	__tests__: { icon: LuFolder, color: "text-green-400" },
	docs: { icon: LuFolder, color: "text-blue-400" },
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
				icon: isOpen ? LuFolderOpen : folderIcon.icon,
				color: folderIcon.color,
			};
		}
		return {
			icon: isOpen ? LuFolderOpen : LuFolder,
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
		icon: LuFile,
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
