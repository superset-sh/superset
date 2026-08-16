import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
	PluginActionContext,
	PluginActionHandler,
	PluginBackendFactory,
	PluginBackendInstance,
	PluginEvent,
	PluginWorkspaceInfo,
	SupersetPluginApi,
} from "@superset/plugin-sdk";
import type {
	PluginEventKind,
	PluginManifest,
} from "@superset/plugin-sdk/manifest";
import { createJiti } from "jiti";
import type { EventBus } from "../events";
import type { ServerMessage } from "../events/types";
import { managedPluginDir } from "./install";
import type { PluginRow, PluginStore } from "./store";

const ACTION_TIMEOUT_MS = 10_000;
const EVENT_HANDLER_TIMEOUT_MS = 5_000;
const HOOK_COMMAND_TIMEOUT_MS = 60_000;
const FACTORY_TIMEOUT_MS = 10_000;

interface LoadedPlugin {
	row: PluginRow;
	manifest: PluginManifest;
	rootDir: string;
	actions: Map<string, PluginActionHandler>;
	eventHandlers: Map<
		PluginEventKind | "*",
		Set<(event: PluginEvent) => void | Promise<void>>
	>;
	disposers: Array<() => void | Promise<void>>;
	backend: PluginBackendInstance | null;
	status: "running" | "error";
	error: string | null;
}

export interface PluginSnapshot {
	id: string;
	name: string;
	version: string;
	description: string | null;
	sourceType: PluginRow["sourceType"];
	source: string;
	sourceCommit: string | null;
	enabled: boolean;
	status: "running" | "error" | "disabled";
	error: string | null;
	manifest: PluginManifest;
	installedAt: number;
	updatedAt: number;
}

function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	label: string,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`${label} timed out after ${ms}ms`)),
			ms,
		);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

function toPluginEvent(message: ServerMessage): PluginEvent | null {
	switch (message.type) {
		case "workspace:changed":
			return {
				kind: `workspace.${message.eventType}`,
				workspaceId: message.workspaceId,
				payload: message,
				occurredAt: message.occurredAt,
			};
		case "project:changed":
			return {
				kind: `project.${message.eventType}`,
				payload: message,
				occurredAt: message.occurredAt,
			};
		case "agent:lifecycle":
			return {
				kind: "agent.lifecycle",
				workspaceId: message.workspaceId,
				payload: message,
				occurredAt: message.occurredAt,
			};
		case "terminal:lifecycle":
			return {
				kind: "terminal.exit",
				workspaceId: message.workspaceId,
				payload: message,
				occurredAt: message.occurredAt,
			};
		case "port:changed":
			return {
				kind: message.eventType === "add" ? "port.added" : "port.removed",
				workspaceId: message.workspaceId,
				payload: message,
				occurredAt: message.occurredAt,
			};
		default:
			return null;
	}
}

export interface PluginRuntimeOptions {
	store: PluginStore;
	eventBus: EventBus;
	listWorkspaces: () => PluginWorkspaceInfo[];
}

/**
 * Loads enabled plugin backends in-process and contains their failures:
 * every registered handler is time-boxed and error-contained, a plugin that
 * fails to load is recorded as `error` without affecting others, and reload
 * is atomic per plugin (unload old, load new; a failed load leaves the
 * plugin in `error`, never half-running).
 */
export class PluginRuntime {
	private readonly store: PluginStore;
	private readonly eventBus: EventBus;
	private readonly listWorkspaces: () => PluginWorkspaceInfo[];
	private readonly loaded = new Map<string, LoadedPlugin>();
	private readonly loadErrors = new Map<string, string>();
	private removeBroadcastTap: (() => void) | null = null;
	private jiti: ReturnType<typeof createJiti> | null = null;

	// Lazy so hosts that only run prebuilt plugins never pay for (or risk)
	// jiti's transform machinery.
	private getJiti(): ReturnType<typeof createJiti> {
		this.jiti ??= createJiti(import.meta.url, {
			interopDefault: true,
			// A reload must observe edited source, not the first import.
			moduleCache: false,
		});
		return this.jiti;
	}

	constructor(options: PluginRuntimeOptions) {
		this.store = options.store;
		this.eventBus = options.eventBus;
		this.listWorkspaces = options.listWorkspaces;
	}

	async start(): Promise<void> {
		if (this.removeBroadcastTap) return;
		this.removeBroadcastTap = this.eventBus.onBroadcast((message) => {
			this.dispatchEvent(message);
		});
		for (const row of this.store.list()) {
			if (!row.enabled) continue;
			await this.load(row).catch((error) => {
				console.error(`[plugins] failed to load ${row.id}:`, error);
			});
		}
	}

	async dispose(): Promise<void> {
		this.removeBroadcastTap?.();
		this.removeBroadcastTap = null;
		for (const id of [...this.loaded.keys()]) {
			await this.unload(id).catch((error) => {
				console.error(`[plugins] failed to unload ${id}:`, error);
			});
		}
	}

	resolveRootDir(row: PluginRow): string {
		return row.sourceType === "link" ? row.source : managedPluginDir(row.id);
	}

	list(): PluginSnapshot[] {
		return this.store.list().map((row) => {
			const live = this.loaded.get(row.id);
			const manifest = live?.manifest ?? this.parseRowManifest(row);
			return {
				id: row.id,
				name: row.name,
				version: row.version,
				description: row.description,
				sourceType: row.sourceType,
				source: row.source,
				sourceCommit: row.sourceCommit,
				enabled: row.enabled,
				status: !row.enabled ? "disabled" : (live?.status ?? "error"),
				error: live?.error ?? this.loadErrors.get(row.id) ?? null,
				manifest,
				installedAt: row.installedAt,
				updatedAt: row.updatedAt,
			};
		});
	}

	private parseRowManifest(row: PluginRow): PluginManifest {
		return JSON.parse(row.manifestJson) as PluginManifest;
	}

	async load(row: PluginRow): Promise<void> {
		if (this.loaded.has(row.id)) await this.unload(row.id);
		this.loadErrors.delete(row.id);
		const manifest = this.parseRowManifest(row);
		const rootDir = this.resolveRootDir(row);
		const plugin: LoadedPlugin = {
			row,
			manifest,
			rootDir,
			actions: new Map(),
			eventHandlers: new Map(),
			disposers: [],
			backend: null,
			status: "running",
			error: null,
		};
		if (manifest.server) {
			try {
				const entryPath = path.join(rootDir, manifest.server);
				// Prebuilt JS entries load natively (install path). TS entries go
				// through jiti — the dev-link flow, where the plugin author edits
				// source and reloads.
				const mod = (
					/\.[cm]?tsx?$/.test(entryPath)
						? await this.getJiti().import(entryPath)
						: await import(
								`${pathToFileURL(entryPath).href}?v=${row.updatedAt}`
							)
				) as PluginBackendFactory | { default?: PluginBackendFactory };
				const factory =
					typeof mod === "function"
						? mod
						: typeof mod?.default === "function"
							? mod.default
							: null;
				if (!factory) {
					throw new Error(
						`server entry "${manifest.server}" has no default-exported factory`,
					);
				}
				const api = this.buildApi(plugin);
				const backend = await withTimeout(
					Promise.resolve(factory(api)),
					FACTORY_TIMEOUT_MS,
					`${row.id} factory`,
				);
				plugin.backend = backend ?? null;
			} catch (error) {
				plugin.status = "error";
				plugin.error = error instanceof Error ? error.message : String(error);
				// Keep the registered-so-far state torn down: a failed factory
				// must not leave live subscriptions behind.
				await this.runDisposers(plugin);
				plugin.actions.clear();
				plugin.eventHandlers.clear();
				this.loadErrors.set(row.id, plugin.error);
			}
		}
		this.loaded.set(row.id, plugin);
		this.broadcastLifecycle(row.id);
	}

	// Nudges clients to refetch the plugin list (enable/disable/reload/install).
	private broadcastLifecycle(pluginId: string): void {
		this.eventBus.broadcastPluginEvent({
			pluginId,
			payload: { type: "lifecycle" },
			occurredAt: Date.now(),
		});
	}

	async unload(id: string): Promise<void> {
		const plugin = this.loaded.get(id);
		if (!plugin) return;
		this.loaded.delete(id);
		this.broadcastLifecycle(id);
		await this.runDisposers(plugin);
		if (plugin.backend?.dispose) {
			try {
				await withTimeout(
					Promise.resolve(plugin.backend.dispose()),
					EVENT_HANDLER_TIMEOUT_MS,
					`${id} dispose`,
				);
			} catch (error) {
				console.error(`[plugins] ${id} dispose failed:`, error);
			}
		}
	}

	async reload(id: string): Promise<void> {
		const row = this.store.get(id);
		if (!row) throw new Error(`Plugin not installed: ${id}`);
		await this.unload(id);
		if (row.enabled) await this.load(row);
	}

	async invokeAction(
		id: string,
		action: string,
		params: unknown,
		context: PluginActionContext,
	): Promise<unknown> {
		const plugin = this.loaded.get(id);
		if (!plugin || plugin.status !== "running") {
			throw new Error(`Plugin not running: ${id}`);
		}
		const handler = plugin.actions.get(action);
		if (!handler) {
			throw new Error(`Plugin ${id} has no action "${action}"`);
		}
		return withTimeout(
			Promise.resolve(handler(params, context)),
			ACTION_TIMEOUT_MS,
			`${id}.${action}`,
		);
	}

	/** Read the plugin's prebuilt UI bundle (and optional css sibling). */
	async getAppBundle(
		id: string,
	): Promise<{ js: string; css: string | null } | null> {
		const row = this.store.get(id);
		if (!row) return null;
		const manifest = this.parseRowManifest(row);
		if (!manifest.app) return null;
		const rootDir = this.resolveRootDir(row);
		const jsPath = path.join(rootDir, manifest.app);
		const js = await readFile(jsPath, "utf8");
		const cssPath = jsPath.replace(/\.js$/, ".css");
		const css =
			cssPath !== jsPath
				? await readFile(cssPath, "utf8").catch(() => null)
				: null;
		return { js, css };
	}

	private async runDisposers(plugin: LoadedPlugin): Promise<void> {
		for (const dispose of plugin.disposers.splice(0)) {
			try {
				await Promise.resolve(dispose());
			} catch (error) {
				console.error(`[plugins] ${plugin.row.id} disposer failed:`, error);
			}
		}
	}

	private dispatchEvent(message: ServerMessage): void {
		const event = toPluginEvent(message);
		if (!event) return;
		for (const plugin of this.loaded.values()) {
			if (plugin.status !== "running") continue;
			const handlers = [
				...(plugin.eventHandlers.get(event.kind) ?? []),
				...(plugin.eventHandlers.get("*") ?? []),
			];
			for (const handler of handlers) {
				void withTimeout(
					Promise.resolve().then(() => handler(event)),
					EVENT_HANDLER_TIMEOUT_MS,
					`${plugin.row.id} on(${event.kind})`,
				).catch((error) => {
					console.error(
						`[plugins] ${plugin.row.id} event handler failed:`,
						error,
					);
				});
			}
			this.spawnDeclaredHooks(plugin, event);
		}
	}

	private spawnDeclaredHooks(plugin: LoadedPlugin, event: PluginEvent): void {
		const hooks = plugin.manifest.contributes?.events ?? [];
		for (const hook of hooks) {
			if (hook.on !== event.kind) continue;
			const [command, ...args] = hook.command;
			if (!command) continue;
			try {
				const child = spawn(command, args, {
					cwd: plugin.rootDir,
					stdio: "ignore",
					env: {
						...process.env,
						SUPERSET_PLUGIN_ID: plugin.row.id,
						SUPERSET_PLUGIN_ROOT: plugin.rootDir,
						SUPERSET_PLUGIN_EVENT: event.kind,
						SUPERSET_PLUGIN_EVENT_JSON: JSON.stringify(event),
						...(event.workspaceId
							? { SUPERSET_WORKSPACE_ID: event.workspaceId }
							: {}),
					},
					timeout: HOOK_COMMAND_TIMEOUT_MS,
				});
				child.on("error", (error) => {
					console.error(
						`[plugins] ${plugin.row.id} hook ${hook.command.join(" ")} failed:`,
						error,
					);
				});
			} catch (error) {
				console.error(`[plugins] ${plugin.row.id} hook spawn failed:`, error);
			}
		}
	}

	private buildApi(plugin: LoadedPlugin): SupersetPluginApi {
		const { store, eventBus } = this;
		const pluginId = plugin.row.id;
		return {
			pluginId,
			log(message, data) {
				console.log(`[plugin:${pluginId}] ${message}`, data ?? "");
			},
			storage: {
				async get(key) {
					// biome-ignore lint/suspicious/noExplicitAny: generic KV read
					return store.kvGet(pluginId, key) as any;
				},
				async set(key, value) {
					store.kvSet(pluginId, key, value);
				},
				async delete(key) {
					store.kvDelete(pluginId, key);
				},
				async keys() {
					return store.kvKeys(pluginId);
				},
			},
			events: {
				on(kind, handler) {
					let set = plugin.eventHandlers.get(kind);
					if (!set) {
						set = new Set();
						plugin.eventHandlers.set(kind, set);
					}
					set.add(handler);
					const unsubscribe = () => {
						set?.delete(handler);
					};
					plugin.disposers.push(unsubscribe);
					return unsubscribe;
				},
			},
			actions: {
				register(name, handler) {
					if (plugin.actions.has(name)) {
						throw new Error(`action "${name}" is already registered`);
					}
					plugin.actions.set(name, handler);
				},
			},
			realtime: {
				publish(payload) {
					eventBus.broadcastPluginEvent({
						pluginId,
						payload,
						occurredAt: Date.now(),
					});
				},
			},
			workspaces: {
				list: async () => this.listWorkspaces(),
			},
			background: {
				interval(ms, fn) {
					const timer = setInterval(() => {
						void withTimeout(
							Promise.resolve().then(fn),
							Math.max(ms, EVENT_HANDLER_TIMEOUT_MS),
							`${pluginId} interval`,
						).catch((error) => {
							console.error(`[plugins] ${pluginId} interval failed:`, error);
						});
					}, ms);
					const unsubscribe = () => clearInterval(timer);
					plugin.disposers.push(unsubscribe);
					return unsubscribe;
				},
			},
		};
	}
}
