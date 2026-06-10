import type { ExternalApp } from "@superset/local-db";
import { normalizeFileManagerPlatform } from "./file-manager-labels";

const MACOS_ONLY_APPS = new Set<ExternalApp>([
	"appcode",
	"iterm",
	"terminal",
	"xcode",
]);

export function isExternalAppAvailableOnPlatform(
	app: ExternalApp,
	platform?: string | null,
): boolean {
	const normalizedPlatform = normalizeFileManagerPlatform(
		platform ?? navigatorPlatform(),
	);

	if (normalizedPlatform === "unknown") return true;
	if (normalizedPlatform === "darwin") return true;
	return !MACOS_ONLY_APPS.has(app);
}

export function filterExternalAppsForPlatform<T extends { id: ExternalApp }>(
	apps: T[],
	platform?: string | null,
): T[] {
	return apps.filter((app) =>
		isExternalAppAvailableOnPlatform(app.id, platform),
	);
}

function navigatorPlatform(): string | null {
	if (typeof navigator === "undefined") return null;
	return navigator.platform;
}
