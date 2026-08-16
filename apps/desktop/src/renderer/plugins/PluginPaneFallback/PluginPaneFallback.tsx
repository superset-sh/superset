import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { LuPuzzle } from "react-icons/lu";

interface PluginPaneFallbackProps {
	kind: string;
	/** From the persisted pane data; absent for non-plugin unknown kinds. */
	pluginId: string | undefined;
	onClose: () => void;
}

/**
 * Rendered for pane kinds with no registry entry. Plugin panes land here
 * when their plugin is disabled, broken, or uninstalled while the pane is
 * still in the persisted layout — offer the recovery action instead of a
 * dead "unknown kind" message.
 */
export function PluginPaneFallback({
	kind,
	pluginId,
	onClose,
}: PluginPaneFallbackProps) {
	const { data: plugins, isPending } = workspaceTrpc.plugins.list.useQuery();
	const setEnabled = workspaceTrpc.plugins.setEnabled.useMutation({
		onError: (error) => toast.error(error.message),
	});
	const reload = workspaceTrpc.plugins.reload.useMutation({
		onError: (error) => toast.error(error.message),
	});

	if (!pluginId) {
		return (
			<Shell>
				<p>Unknown pane kind: {kind}</p>
			</Shell>
		);
	}
	if (isPending) {
		return (
			<Shell>
				<p>Loading plugin pane…</p>
			</Shell>
		);
	}

	const plugin = plugins?.find((p) => p.id === pluginId);
	if (!plugin) {
		return (
			<Shell>
				<p>
					This pane belongs to the plugin{" "}
					<code className="text-foreground">{pluginId}</code>, which is not
					installed.
				</p>
				<Button variant="outline" size="sm" onClick={onClose}>
					Close pane
				</Button>
			</Shell>
		);
	}
	if (!plugin.enabled) {
		return (
			<Shell>
				<p>
					<span className="text-foreground">{plugin.name}</span> is disabled.
				</p>
				<Button
					variant="outline"
					size="sm"
					disabled={setEnabled.isPending}
					onClick={() => setEnabled.mutate({ id: plugin.id, enabled: true })}
				>
					Enable plugin
				</Button>
			</Shell>
		);
	}
	if (plugin.status === "error") {
		return (
			<Shell>
				<p>
					<span className="text-foreground">{plugin.name}</span> failed to load
					{plugin.error ? `: ${plugin.error}` : "."}
				</p>
				<Button
					variant="outline"
					size="sm"
					disabled={reload.isPending}
					onClick={() => reload.mutate({ id: plugin.id })}
				>
					Reload plugin
				</Button>
			</Shell>
		);
	}
	// Running but this kind isn't contributed (removed from the manifest).
	return (
		<Shell>
			<p>
				<span className="text-foreground">{plugin.name}</span> no longer
				provides this pane.
			</p>
			<Button variant="outline" size="sm" onClick={onClose}>
				Close pane
			</Button>
		</Shell>
	);
}

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-xs text-muted-foreground">
			<LuPuzzle className="size-5 opacity-60" />
			{children}
		</div>
	);
}
