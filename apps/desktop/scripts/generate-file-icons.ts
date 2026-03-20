import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateManifest } from "material-icon-theme";

const ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = resolve(ROOT, "src/resources/public/file-icons");
const ICONS_SRC = resolve(ROOT, "node_modules/material-icon-theme/icons");

interface CondensedManifest {
	fileNames: Record<string, string>;
	fileExtensions: Record<string, string>;
	folderNames: Record<string, string>;
	folderNamesExpanded: Record<string, string>;
	defaultIcon: string;
	defaultFolderIcon: string;
	defaultFolderOpenIcon: string;
}

function run() {
	const manifest = generateManifest({
		activeIconPack: "react",
		folders: { theme: "specific" },
	});

	// Collect all referenced icon names from the manifest
	const referencedIcons = new Set<string>();

	const addIcon = (name: string | undefined) => {
		if (name) referencedIcons.add(name);
	};

	// Default icons
	addIcon(manifest.file);
	addIcon(manifest.folder);
	addIcon(manifest.folderExpanded);

	// File mappings
	for (const icon of Object.values(manifest.fileNames ?? {})) addIcon(icon);
	for (const icon of Object.values(manifest.fileExtensions ?? {}))
		addIcon(icon);

	// Folder mappings
	for (const icon of Object.values(manifest.folderNames ?? {})) addIcon(icon);
	for (const icon of Object.values(manifest.folderNamesExpanded ?? {}))
		addIcon(icon);

	// Build condensed manifest
	const condensed: CondensedManifest = {
		fileNames: manifest.fileNames ?? {},
		fileExtensions: manifest.fileExtensions ?? {},
		folderNames: manifest.folderNames ?? {},
		folderNamesExpanded: manifest.folderNamesExpanded ?? {},
		defaultIcon: manifest.file ?? "file",
		defaultFolderIcon: manifest.folder ?? "folder",
		defaultFolderOpenIcon: manifest.folderExpanded ?? "folder-open",
	};

	// material-icon-theme relies on VS Code's languageIds for base extensions.
	// Since Electron has no languageId system, add them explicitly.
	const baseExtensionDefaults: Record<string, string> = {
		ts: "typescript",
		js: "javascript",
	};

	for (const [ext, icon] of Object.entries(baseExtensionDefaults)) {
		if (!condensed.fileExtensions[ext]) {
			condensed.fileExtensions[ext] = icon;
			referencedIcons.add(icon);
		}
	}

	// Prepare output directory
	if (existsSync(OUT_DIR)) {
		rmSync(OUT_DIR, { recursive: true });
	}
	mkdirSync(OUT_DIR, { recursive: true });

	// Copy only referenced SVGs
	let copied = 0;
	for (const iconName of referencedIcons) {
		const srcPath = resolve(ICONS_SRC, `${iconName}.svg`);
		const destPath = resolve(OUT_DIR, `${iconName}.svg`);
		if (existsSync(srcPath)) {
			cpSync(srcPath, destPath);
			copied++;
		}
	}

	// Write manifest JSON
	writeFileSync(
		resolve(OUT_DIR, "manifest.json"),
		JSON.stringify(condensed, null, 2),
	);

	console.log(
		`Generated file icons: ${copied} SVGs copied, ${Object.keys(condensed.fileNames).length} file names, ${Object.keys(condensed.fileExtensions).length} extensions, ${Object.keys(condensed.folderNames).length} folder names`,
	);
}

run();
