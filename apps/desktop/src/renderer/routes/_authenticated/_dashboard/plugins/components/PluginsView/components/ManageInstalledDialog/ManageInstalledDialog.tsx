import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Switch } from "@superset/ui/switch";
import { LuTrash2 } from "react-icons/lu";
import { PluginIcon } from "renderer/routes/_authenticated/_dashboard/plugins/components/PluginIcon";
import type { CatalogPlugin } from "renderer/routes/_authenticated/_dashboard/plugins/hooks/usePluginCatalog";

interface ManageInstalledDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	installed: CatalogPlugin[];
	isBusy: boolean;
	onSetEnabled: (name: string, enabled: boolean) => void;
	onUninstall: (name: string) => void;
}

export function ManageInstalledDialog({
	open,
	onOpenChange,
	installed,
	isBusy,
	onSetEnabled,
	onUninstall,
}: ManageInstalledDialogProps) {
	const { t } = useLingui();
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>
						<Trans>Manage plugins</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							Disabling keeps a plugin installed but removes its servers from
							your agents. Changes take effect in new agent sessions.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				{installed.length === 0 ? (
					<p className="py-4 text-sm text-muted-foreground">
						<Trans>Nothing installed yet.</Trans>
					</p>
				) : (
					<div className="flex flex-col divide-y divide-border/60">
						{installed.map((plugin) => {
							const servers = Object.keys(plugin.mcpServers).join(", ");
							return (
								<div key={plugin.name} className="flex items-center gap-3 py-3">
									<PluginIcon pluginName={plugin.name} className="size-8" />
									<div className="min-w-0 flex-1">
										<div className="text-sm font-medium text-foreground">
											{plugin.interface.displayName}
										</div>
										<p className="truncate text-xs text-muted-foreground">
											v{plugin.version}
											{servers ? ` · ${servers}` : ""}
										</p>
									</div>
									<Switch
										checked={plugin.enabled}
										disabled={isBusy}
										aria-label={t({
											message: `${plugin.interface.displayName} enabled`,
										})}
										onCheckedChange={(checked) =>
											onSetEnabled(plugin.name, checked)
										}
									/>
									<Button
										variant="ghost"
										size="icon-xs"
										className="shrink-0 text-muted-foreground hover:text-destructive"
										disabled={isBusy}
										aria-label={t({
											message: `Uninstall ${plugin.interface.displayName}`,
										})}
										onClick={() => onUninstall(plugin.name)}
									>
										<LuTrash2 className="size-4" />
									</Button>
								</div>
							);
						})}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
