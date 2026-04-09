import {
	projects,
	settings,
	type TerminalProxyOverride,
	type TerminalProxySettings,
	workspaces,
} from "@superset/local-db";
import { eq } from "drizzle-orm";
import {
	getProcessEnvWithShellEnv,
	getShellEnvironment,
} from "lib/trpc/routers/workspaces/utils/shell-env";
import { localDb } from "main/lib/local-db";
import type {
	DetectedInheritedProxy,
	EffectiveTerminalProxy,
} from "shared/terminal-proxy";
import {
	buildProxyEnvVars,
	detectInheritedProxyFromEnv,
	resolveEffectiveTerminalProxyFromSettings,
	stripProxyEnvVars,
} from "shared/terminal-proxy";

const DEFAULT_GLOBAL_PROXY_SETTINGS: TerminalProxySettings = {
	mode: "auto",
};

const DEFAULT_PROJECT_PROXY_OVERRIDE: TerminalProxyOverride = {
	mode: "inherit",
};

function normalizeGlobalSettings(
	value: TerminalProxySettings | null | undefined,
): TerminalProxySettings {
	if (!value) {
		return DEFAULT_GLOBAL_PROXY_SETTINGS;
	}
	return value;
}

function normalizeProjectOverride(
	value: TerminalProxyOverride | null | undefined,
): TerminalProxyOverride {
	if (!value) {
		return DEFAULT_PROJECT_PROXY_OVERRIDE;
	}
	return value;
}

export async function getDetectedInheritedProxy(params?: {
	forceRefresh?: boolean;
}): Promise<DetectedInheritedProxy> {
	const shellEnv = params?.forceRefresh
		? await getShellEnvironment({ forceRefresh: true })
		: undefined;
	const mergedEnv = await getProcessEnvWithShellEnv(process.env, shellEnv);
	return detectInheritedProxyFromEnv(mergedEnv);
}

export async function resolveEffectiveTerminalProxy(params: {
	projectId: string;
}): Promise<EffectiveTerminalProxy> {
	const project = localDb
		.select({ terminalProxyOverride: projects.terminalProxyOverride })
		.from(projects)
		.where(eq(projects.id, params.projectId))
		.get();

	if (!project) {
		return { state: "none", source: "none" };
	}

	const row = localDb.select().from(settings).get();
	const globalSettings = normalizeGlobalSettings(row?.terminalProxySettings);
	const projectOverride = normalizeProjectOverride(
		project.terminalProxyOverride,
	);

	const inheritedProxy = await getDetectedInheritedProxy();
	return resolveEffectiveTerminalProxyFromSettings({
		projectOverride,
		globalSettings,
		inheritedProxy,
	});
}

export async function resolveEffectiveTerminalProxyForWorkspace(params: {
	workspaceId: string;
}): Promise<EffectiveTerminalProxy> {
	const workspace = localDb
		.select({ projectId: workspaces.projectId })
		.from(workspaces)
		.where(eq(workspaces.id, params.workspaceId))
		.get();

	if (!workspace?.projectId) {
		return { state: "none", source: "none" };
	}

	return resolveEffectiveTerminalProxy({ projectId: workspace.projectId });
}

export function applyTerminalProxyToEnv(
	env: Record<string, string>,
	effectiveProxy: EffectiveTerminalProxy,
): Record<string, string> {
	const stripped = stripProxyEnvVars(env);

	if (effectiveProxy.state !== "manual" || !effectiveProxy.config) {
		return stripped;
	}

	if (effectiveProxy.httpProxy || effectiveProxy.httpsProxy) {
		return {
			...stripped,
			...(effectiveProxy.httpProxy
				? {
						HTTP_PROXY: effectiveProxy.httpProxy,
						http_proxy: effectiveProxy.httpProxy,
					}
				: {}),
			...(effectiveProxy.httpsProxy
				? {
						HTTPS_PROXY: effectiveProxy.httpsProxy,
						https_proxy: effectiveProxy.httpsProxy,
					}
				: {}),
			...(effectiveProxy.config.noProxy
				? {
						NO_PROXY: effectiveProxy.config.noProxy,
						no_proxy: effectiveProxy.config.noProxy,
					}
				: {}),
		};
	}

	return {
		...stripped,
		...buildProxyEnvVars(effectiveProxy.config),
	};
}

export function getGlobalTerminalProxySettings(): TerminalProxySettings {
	const row = localDb.select().from(settings).get();
	return normalizeGlobalSettings(row?.terminalProxySettings);
}
