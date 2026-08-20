import type { PluginCatalogEntry } from "@superset/shared/plugins";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuCheck, LuEllipsis, LuTrash2 } from "react-icons/lu";
import { PluginIcon } from "../PluginIcon";

interface PluginCardProps {
	plugin: PluginCatalogEntry;
	isInstalled: boolean;
	isBusy: boolean;
	onInstall: (plugin: PluginCatalogEntry) => void;
	onUninstall: (plugin: PluginCatalogEntry) => void;
}

export function PluginCard({
	plugin,
	isInstalled,
	isBusy,
	onInstall,
	onUninstall,
}: PluginCardProps) {
	return (
		<div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background p-3 transition-colors hover:border-border">
			<PluginIcon pluginName={plugin.name} />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
					{plugin.interface.displayName}
					{isInstalled && (
						<LuCheck className="size-3.5 shrink-0 text-muted-foreground" />
					)}
				</div>
				<p className="truncate text-xs text-muted-foreground">
					{plugin.description}
				</p>
			</div>
			{isInstalled ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon-xs"
							className="shrink-0 text-muted-foreground"
							aria-label={`${plugin.interface.displayName} options`}
						>
							<LuEllipsis className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							variant="destructive"
							disabled={isBusy}
							onSelect={() => onUninstall(plugin)}
						>
							<LuTrash2 className="size-4" />
							Uninstall
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			) : (
				<Button
					variant="outline"
					size="sm"
					className="shrink-0 rounded-full"
					disabled={isBusy}
					onClick={() => onInstall(plugin)}
				>
					Install
				</Button>
			)}
		</div>
	);
}
