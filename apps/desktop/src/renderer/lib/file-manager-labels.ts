export type FileManagerPlatform = "darwin" | "win32" | "linux" | "unknown";

export function normalizeFileManagerPlatform(
	platform?: string | null,
): FileManagerPlatform {
	const value = platform?.toLowerCase() ?? "";
	if (value.includes("mac") || value === "darwin") return "darwin";
	if (value.includes("win") || value === "win32") return "win32";
	if (value.includes("linux")) return "linux";
	return "unknown";
}

export function getFileManagerName(platform?: string | null): string {
	switch (normalizeFileManagerPlatform(platform ?? navigatorPlatform())) {
		case "win32":
			return "File Explorer";
		case "linux":
			return "Files";
		case "darwin":
		case "unknown":
			return "Finder";
	}
}

export function getOpenInFileManagerLabel(platform?: string | null): string {
	return `Open in ${getFileManagerName(platform)}`;
}

export function getRevealInFileManagerLabel(platform?: string | null): string {
	return `Reveal in ${getFileManagerName(platform)}`;
}

function navigatorPlatform(): string | null {
	if (typeof navigator === "undefined") return null;
	return navigator.platform;
}
