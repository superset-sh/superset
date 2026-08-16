import type { PluginEventKind } from "./manifest";

export type Unsubscribe = () => void;

export interface PluginEvent {
	kind: PluginEventKind;
	/** Present for workspace-scoped events. */
	workspaceId?: string;
	/** Raw event payload as carried on the host event bus. */
	payload: unknown;
	occurredAt: number;
}

export interface PluginActionContext {
	/** Set when the action was invoked from a workspace-scoped UI surface. */
	workspaceId?: string;
}

export type PluginActionHandler = (
	params: unknown,
	context: PluginActionContext,
) => unknown | Promise<unknown>;

export interface PluginWorkspaceInfo {
	id: string;
	name: string;
	branch: string;
	type: "main" | "worktree" | "session";
	projectId: string | null;
	/** Absolute worktree path on this host (plugins run full-trust beside it). */
	worktreePath: string;
}

/**
 * The backend API handed to a plugin's server entry. Plugins run in-process
 * inside the host-service: full trust, contained failures. Every handler a
 * plugin registers is time-boxed and error-contained by the host — a slow or
 * throwing plugin degrades itself, never the host.
 */
export interface SupersetPluginApi {
	readonly pluginId: string;
	/** Structured log line, attributed to the plugin in host logs. */
	log(message: string, data?: Record<string, unknown>): void;
	/** Namespaced persistent KV. Values are JSON-serialized, ≤256KB each. */
	storage: {
		get<T = unknown>(key: string): Promise<T | null>;
		set(key: string, value: unknown): Promise<void>;
		delete(key: string): Promise<void>;
		keys(): Promise<string[]>;
	};
	/** Subscribe to lifecycle events. `"*"` receives every kind. */
	events: {
		on(
			kind: PluginEventKind | "*",
			handler: (event: PluginEvent) => void | Promise<void>,
		): Unsubscribe;
	};
	/**
	 * Named actions invokable from the plugin's UI components, contributed
	 * palette commands, and `superset plugin invoke`.
	 */
	actions: {
		register(name: string, handler: PluginActionHandler): void;
	};
	/** Push an ephemeral payload to this plugin's mounted UI components. */
	realtime: {
		publish(payload: unknown): void;
	};
	/** Supervised repeating task; cleared on plugin unload/reload. */
	background: {
		interval(ms: number, fn: () => void | Promise<void>): Unsubscribe;
	};
	/** Read access to live (non-archived) workspaces on this host. */
	workspaces: {
		list(): Promise<PluginWorkspaceInfo[]>;
	};
}

export interface PluginBackendInstance {
	dispose?(): void | Promise<void>;
}

export type PluginBackendFactory = (
	api: SupersetPluginApi,
) =>
	| undefined
	| PluginBackendInstance
	| Promise<undefined | PluginBackendInstance>;

/** Identity helper so plugin server entries get typed `api` without imports gymnastics. */
export function definePlugin(
	factory: PluginBackendFactory,
): PluginBackendFactory {
	return factory;
}
