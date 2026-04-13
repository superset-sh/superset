/**
 * Extension loader: discovers, loads, and activates VS Code extensions.
 *
 * Intercepts `require('vscode')` via Module._resolveFilename so that
 * extensions receive our shim instead of the real VS Code API.
 */

import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { registerExtensionDefaults } from "./api/configuration";
import { shimLog, shimWarn } from "./api/debug-log";
import {
	createExtensionContext,
	type VscodeExtensionContext,
} from "./api/extension-context";
import type { ExtensionInfo, ExtensionManifest } from "./types";
import { createVscodeApi } from "./vscode-api";

const vscodeApi = createVscodeApi();
let interceptInstalled = false;

type ResolveFilename = (
	this: unknown,
	request: string,
	parent: unknown,
	isMain: boolean,
	options: unknown,
) => string;

function installRequireIntercept(): void {
	if (interceptInstalled) return;
	interceptInstalled = true;

	// Inject vscode shim into require cache so require('vscode') returns our API.
	// We use _resolveFilename to redirect 'vscode' to a known cache key,
	// and pre-populate the cache with our shim module.
	const VSCODE_CACHE_KEY = path.join(__dirname, "__vscode_shim_module__");

	// Pre-populate the require cache
	require.cache[VSCODE_CACHE_KEY] = {
		id: VSCODE_CACHE_KEY,
		filename: VSCODE_CACHE_KEY,
		loaded: true,
		exports: vscodeApi,
		children: [],
		paths: [],
		path: __dirname,
		parent: null,
		require,
		isPreloading: false,
	} as unknown as NodeModule;

	const moduleWithResolver = Module as unknown as {
		_resolveFilename: ResolveFilename;
	};
	const originalResolveFilename = moduleWithResolver._resolveFilename;
	moduleWithResolver._resolveFilename = function (
		request: string,
		parent: unknown,
		isMain: boolean,
		options: unknown,
	) {
		if (request === "vscode") {
			return VSCODE_CACHE_KEY;
		}
		return originalResolveFilename.call(this, request, parent, isMain, options);
	};
}

export function discoverExtensions(extensionsDir: string): ExtensionInfo[] {
	if (!fs.existsSync(extensionsDir)) return [];

	const results: ExtensionInfo[] = [];
	const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const extPath = path.join(extensionsDir, entry.name);
		const manifestPath = path.join(extPath, "package.json");

		if (!fs.existsSync(manifestPath)) continue;

		try {
			const manifest: ExtensionManifest = JSON.parse(
				fs.readFileSync(manifestPath, "utf-8"),
			);
			if (!manifest.main) continue;

			const id = `${manifest.publisher}.${manifest.name}`.toLowerCase();
			results.push({
				id,
				extensionPath: extPath,
				manifest,
				isActive: false,
			});
		} catch (err) {
			shimWarn(`[vscode-shim] Failed to parse ${manifestPath}:`, err);
		}
	}

	return results;
}

interface LoadedExtension {
	info: ExtensionInfo;
	context: VscodeExtensionContext;
	exports: Record<string, unknown>;
}

const loadedExtensions = new Map<string, LoadedExtension>();

export async function loadExtension(
	info: ExtensionInfo,
): Promise<LoadedExtension> {
	const existing = loadedExtensions.get(info.id);
	if (existing) {
		return existing;
	}

	installRequireIntercept();

	// Register default configuration values
	registerExtensionDefaults(info.manifest);

	// Create extension context
	const context = createExtensionContext(
		info.id,
		info.extensionPath,
		info.manifest,
	);

	// Load the extension's main module
	const manifestMain = info.manifest.main;
	if (!manifestMain) {
		throw new Error(`[vscode-shim] Extension ${info.id} has no main entry`);
	}
	const mainPath = path.resolve(info.extensionPath, manifestMain);
	shimLog(`[vscode-shim] Loading extension: ${info.id} from ${mainPath}`);

	let extensionModule: Record<string, unknown>;
	try {
		extensionModule = require(mainPath);
	} catch (err) {
		console.error(`[vscode-shim] Failed to require ${info.id}:`, err);
		throw err;
	}

	// Activate the extension
	if (typeof extensionModule.activate === "function") {
		shimLog(`[vscode-shim] Activating extension: ${info.id}`);
		try {
			await extensionModule.activate(context);
			info.isActive = true;
			shimLog(`[vscode-shim] Extension activated: ${info.id}`);
		} catch (err) {
			console.error(`[vscode-shim] Failed to activate ${info.id}:`, err);
			throw err;
		}
	}

	const loaded: LoadedExtension = {
		info,
		context,
		exports: extensionModule,
	};

	loadedExtensions.set(info.id, loaded);
	return loaded;
}

export async function deactivateExtension(extensionId: string): Promise<void> {
	const loaded = loadedExtensions.get(extensionId);
	if (!loaded) return;

	if (typeof loaded.exports.deactivate === "function") {
		try {
			await loaded.exports.deactivate();
		} catch (err) {
			console.error(`[vscode-shim] Failed to deactivate ${extensionId}:`, err);
		}
	}

	// Dispose all subscriptions
	for (const sub of loaded.context.subscriptions) {
		try {
			sub.dispose();
		} catch {}
	}

	loaded.info.isActive = false;
	loadedExtensions.delete(extensionId);
}

export async function deactivateAll(): Promise<void> {
	for (const id of [...loadedExtensions.keys()]) {
		await deactivateExtension(id);
	}
}

export function getLoadedExtension(
	extensionId: string,
): LoadedExtension | undefined {
	return loadedExtensions.get(extensionId);
}

export function getLoadedExtensions(): LoadedExtension[] {
	return [...loadedExtensions.values()];
}
