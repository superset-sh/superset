import type { PluginSlotProps, PluginUiContext } from "@superset/plugin-sdk/ui";
import { usePluginEvents, workspaceTrpc } from "@superset/workspace-client";
import {
	Component,
	type ComponentType,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	allocPluginMountId,
	publishPluginLocal,
	subscribePluginLocal,
} from "../pluginLocalBus";
import { loadPluginModule } from "../pluginModules";

interface PluginSlotMountProps {
	pluginId: string;
	/** Cache key for the loaded bundle; bump on reload (`${version}:${updatedAt}`). */
	bundleVersion: string;
	componentName: string;
	workspaceId: string;
}

class PluginErrorBoundary extends Component<
	{ pluginId: string; children: ReactNode },
	{ error: Error | null }
> {
	state = { error: null as Error | null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	componentDidCatch(error: Error) {
		console.error(`[plugins] ${this.props.pluginId} render failed:`, error);
	}

	render() {
		if (this.state.error) {
			return (
				<div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
					Plugin "{this.props.pluginId}" crashed: {this.state.error.message}
				</div>
			);
		}
		return this.props.children;
	}
}

/**
 * Mounts one component exported by a plugin's app bundle into a host slot,
 * error-contained so a broken plugin degrades to an inline message instead
 * of taking the surface down.
 */
export function PluginSlotMount({
	pluginId,
	bundleVersion,
	componentName,
	workspaceId,
}: PluginSlotMountProps) {
	const utils = workspaceTrpc.useUtils();
	const [component, setComponent] =
		useState<ComponentType<PluginSlotProps> | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setComponent(null);
		setLoadError(null);
		loadPluginModule(pluginId, bundleVersion, () =>
			utils.client.plugins.getAppBundle.query({ id: pluginId }),
		)
			.then((mod) => {
				if (cancelled) return;
				const exported = mod[componentName];
				if (typeof exported !== "function") {
					setLoadError(`bundle has no component export "${componentName}"`);
					return;
				}
				setComponent(() => exported);
			})
			.catch((error) => {
				if (cancelled) return;
				setLoadError(error instanceof Error ? error.message : String(error));
			});
		return () => {
			cancelled = true;
		};
	}, [pluginId, bundleVersion, componentName, utils]);

	const mountIdRef = useRef(0);
	if (mountIdRef.current === 0) mountIdRef.current = allocPluginMountId();
	const realtimeHandlers = useRef(new Set<(payload: unknown) => void>());
	usePluginEvents(pluginId, (_id, event) => {
		for (const handler of realtimeHandlers.current) {
			try {
				handler(event.payload);
			} catch (error) {
				console.error(`[plugins] ${pluginId} realtime handler failed:`, error);
			}
		}
	});

	const ctx = useMemo<PluginUiContext>(
		() => ({
			pluginId,
			workspaceId,
			invokeAction: (name, params) =>
				utils.client.plugins.invokeAction.mutate({
					id: pluginId,
					action: name,
					params,
					workspaceId,
				}),
			onRealtime: (handler) => {
				realtimeHandlers.current.add(handler);
				return () => {
					realtimeHandlers.current.delete(handler);
				};
			},
			postMessage: (payload) => {
				publishPluginLocal(pluginId, workspaceId, mountIdRef.current, payload);
			},
			onMessage: (handler) =>
				subscribePluginLocal(
					pluginId,
					workspaceId,
					mountIdRef.current,
					handler,
				),
		}),
		[pluginId, workspaceId, utils],
	);

	if (loadError) {
		return (
			<div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
				Plugin "{pluginId}" failed to load: {loadError}
			</div>
		);
	}
	if (!component) {
		return (
			<div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
				Loading plugin…
			</div>
		);
	}
	const Slot = component;
	return (
		<PluginErrorBoundary pluginId={pluginId}>
			<Slot ctx={ctx} />
		</PluginErrorBoundary>
	);
}
