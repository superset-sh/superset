import type { PluginAppModule } from "@superset/plugin-sdk/ui";
import * as React from "react";
import * as ReactJsxRuntime from "react/jsx-runtime";

declare global {
	// eslint-disable-next-line no-var
	var __SUPERSET_PLUGIN_HOST__:
		| { React: typeof React; ReactJsxRuntime: typeof ReactJsxRuntime }
		| undefined;
}

/**
 * Plugin app bundles are built with `react` / `react/jsx-runtime` aliased to
 * shims that read this global, so plugin components render in the host's
 * React tree (one React instance, hooks work).
 */
function ensureHostGlobals(): void {
	if (!globalThis.__SUPERSET_PLUGIN_HOST__) {
		globalThis.__SUPERSET_PLUGIN_HOST__ = { React, ReactJsxRuntime };
	}
}

interface CacheEntry {
	version: string;
	promise: Promise<PluginAppModule>;
}

const moduleCache = new Map<string, CacheEntry>();
const styleTags = new Map<string, HTMLStyleElement>();

function injectCss(pluginId: string, css: string | null): void {
	const existing = styleTags.get(pluginId);
	if (!css) {
		existing?.remove();
		styleTags.delete(pluginId);
		return;
	}
	if (existing) {
		existing.textContent = css;
		return;
	}
	const tag = document.createElement("style");
	tag.dataset.pluginId = pluginId;
	tag.textContent = css;
	document.head.appendChild(tag);
	styleTags.set(pluginId, tag);
}

/**
 * Import a plugin's UI bundle as an ESM module (cached per plugin+version;
 * a reload that bumps `updatedAt` re-imports). `fetchBundle` is the tRPC
 * `plugins.getAppBundle` call, injected so this module stays transport-free.
 */
export function loadPluginModule(
	pluginId: string,
	version: string,
	fetchBundle: () => Promise<{ js: string; css: string | null } | null>,
): Promise<PluginAppModule> {
	const cached = moduleCache.get(pluginId);
	if (cached && cached.version === version) return cached.promise;

	ensureHostGlobals();
	const promise = (async () => {
		const bundle = await fetchBundle();
		if (!bundle) throw new Error(`Plugin ${pluginId} has no app bundle`);
		injectCss(pluginId, bundle.css);
		const blob = new Blob([bundle.js], { type: "text/javascript" });
		const url = URL.createObjectURL(blob);
		try {
			return (await import(/* @vite-ignore */ url)) as PluginAppModule;
		} finally {
			URL.revokeObjectURL(url);
		}
	})();
	// A failed load must not poison the cache — the next mount retries.
	promise.catch(() => {
		if (moduleCache.get(pluginId)?.promise === promise) {
			moduleCache.delete(pluginId);
		}
	});
	moduleCache.set(pluginId, { version, promise });
	return promise;
}

export function evictPluginModule(pluginId: string): void {
	moduleCache.delete(pluginId);
	injectCss(pluginId, null);
}
