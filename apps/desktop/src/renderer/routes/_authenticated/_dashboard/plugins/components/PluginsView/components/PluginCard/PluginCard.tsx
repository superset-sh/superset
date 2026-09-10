import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	LuArrowUp,
	LuCheck,
	LuEllipsis,
	LuPause,
	LuPlay,
	LuTrash2,
} from "react-icons/lu";
import { PluginIcon } from "renderer/routes/_authenticated/_dashboard/plugins/components/PluginIcon";
import { PluginKindBadges } from "renderer/routes/_authenticated/_dashboard/plugins/components/PluginKindBadges";
import type { CatalogPlugin } from "renderer/routes/_authenticated/_dashboard/plugins/hooks/usePluginCatalog";

interface PluginCardProps {
	plugin: CatalogPlugin;
	isInstalled: boolean;
	isConnected: boolean;
	/** Installed but disabled: record kept, nothing materialized. */
	isDisabled: boolean;
	isBusy: boolean;
	onOpen: (plugin: CatalogPlugin) => void;
	onUninstall: (plugin: CatalogPlugin) => void;
	onSetEnabled: (name: string, enabled: boolean) => void;
	onUpdate: (name: string) => void;
}

export function PluginCard({
	plugin,
	isInstalled,
	isConnected,
	isDisabled,
	isBusy,
	onOpen,
	onUninstall,
	onSetEnabled,
	onUpdate,
}: PluginCardProps) {
	const { t } = useLingui();
	return (
		// biome-ignore lint/a11y/useSemanticElements: the card nests a real button (the ··· menu); a native <button> cannot contain it
		<div
			role="button"
			tabIndex={0}
			onClick={() => onOpen(plugin)}
			onKeyDown={(event) => {
				// Only when the card itself is focused — Enter on a nested
				// button (Install, ···) must not also navigate.
				if (event.target !== event.currentTarget) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onOpen(plugin);
				}
			}}
			className="flex cursor-pointer items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-fill-hover"
		>
			<PluginIcon pluginName={plugin.name} />
			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
					{/* Truncates so the badges and status keep their width; without
					    it every sibling is shrink-0 and the row overruns the card,
					    painting over the ··· menu. */}
					<span className="truncate">{plugin.interface.displayName}</span>
					<PluginKindBadges plugin={plugin} />
					{/* One status, most blocking first: disabled runs nothing,
					    unconnected cannot answer a tool call, and an outdated
					    plugin still works. Two of these side by side read as one
					    run-on string, which is what they did. */}
					{isDisabled ? (
						<span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
							<Trans>Disabled</Trans>
						</span>
					) : isInstalled && !isConnected ? (
						<span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
							<Trans>Not connected</Trans>
						</span>
					) : isConnected ? (
						<LuCheck className="size-3.5 shrink-0 text-muted-foreground" />
					) : null}
					{plugin.updateAvailable && !isDisabled && (
						<Button
							variant="outline"
							size="xs"
							disabled={isBusy}
							className="h-4 shrink-0 gap-0.5 rounded px-1 text-[9px] font-medium tracking-wide uppercase"
							onClick={(event) => {
								event.stopPropagation();
								onUpdate(plugin.name);
							}}
						>
							<LuArrowUp className="size-2.5" />
							<Trans>Update</Trans>
						</Button>
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
							aria-label={t({
								message: `${plugin.interface.displayName} options`,
							})}
							onClick={(event) => event.stopPropagation()}
						>
							<LuEllipsis className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{plugin.updateAvailable && (
							<DropdownMenuItem
								disabled={isBusy}
								onSelect={() => onUpdate(plugin.name)}
							>
								<LuArrowUp className="size-4" />
								<Trans>Update</Trans>
							</DropdownMenuItem>
						)}
						<DropdownMenuItem
							disabled={isBusy}
							onSelect={() => onSetEnabled(plugin.name, isDisabled)}
						>
							{isDisabled ? (
								<LuPlay className="size-4" />
							) : (
								<LuPause className="size-4" />
							)}
							{isDisabled ? <Trans>Enable</Trans> : <Trans>Disable</Trans>}
						</DropdownMenuItem>
						<DropdownMenuItem
							variant="destructive"
							disabled={isBusy}
							onSelect={() => onUninstall(plugin)}
						>
							<LuTrash2 className="size-4" />
							<Trans>Remove</Trans>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}
		</div>
	);
}
