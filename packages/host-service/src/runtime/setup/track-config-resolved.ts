import type { ApiClient } from "../../types";
import { describeProjectConfigSources } from "./config";

/**
 * Report which config format a workspace used and which v1 features it still
 * relies on, so they can be removed once unused. Sends names only, never
 * commands or file contents. Fire-and-forget; never throws.
 */
export function trackConfigResolved({
	api,
	organizationId,
	workspaceId,
	phase,
	repoPath,
	projectId,
	worktreePath,
}: {
	api: ApiClient | undefined;
	organizationId: string | undefined;
	workspaceId: string;
	phase: "setup" | "archive";
	repoPath: string;
	projectId: string;
	worktreePath?: string;
}): void {
	try {
		const { format, legacySources } = describeProjectConfigSources({
			repoPath,
			projectId,
			worktreePath,
		});
		if (format === "none") return;
		if (format === "json") {
			console.info(
				`[config] ${repoPath} uses .superset/config.json (${legacySources.join(", ")}). Convert it to config.toml in Settings → Workspace config.`,
			);
		}
		if (!api) return;
		void api.analytics.captureEvent
			.mutate({
				source: "host_service",
				event: "workspace_config_resolved",
				properties: {
					format,
					legacy_sources: legacySources,
					phase,
					workspace_id: workspaceId,
					project_id: projectId,
					organization_id: organizationId ?? null,
				},
			})
			.catch(() => {});
	} catch (error) {
		console.warn("[config] could not report config usage", error);
	}
}
