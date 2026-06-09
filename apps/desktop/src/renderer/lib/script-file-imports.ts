export const SCRIPT_FILE_IMPORT_EXTENSIONS = [
	".sh",
	".bash",
	".zsh",
	".fish",
	".command",
	".cmd",
	".bat",
	".ps1",
	".psm1",
	".ts",
	".js",
	".mjs",
	".cjs",
] as const;

export const SCRIPT_FILE_IMPORT_ACCEPT =
	SCRIPT_FILE_IMPORT_EXTENSIONS.join(",");

export function isScriptFileImportSupported(fileName: string): boolean {
	const lowerFileName = fileName.toLowerCase();
	return SCRIPT_FILE_IMPORT_EXTENSIONS.some((extension) =>
		lowerFileName.endsWith(extension),
	);
}
