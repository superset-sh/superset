import type { ExternalApp } from "@superset/local-db";

export function resolveV2OpenInApp(
	projectApp: ExternalApp | null | undefined,
	globalDefaultEditor: ExternalApp | null | undefined,
): ExternalApp {
	return projectApp ?? globalDefaultEditor ?? "finder";
}
