import { Trans, useLingui } from "@lingui/react/macro";
import type { PluginCatalogEntry } from "@superset/shared/plugins";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuCheck, LuEllipsis, LuPause, LuPlay, LuTrash2 } from "react-icons/lu";
import { PluginIcon } from "renderer/routes/_authenticated/_dashboard/plugins/components/PluginIcon";
import { PluginKindBadges } from "renderer/routes/_authenticated/_dashboard/plugins/components/PluginKindBadges";

interface PluginCardProps {
	plugin: PluginCatalogEntry;
	/** Installed record OR satisfied by the user's own config — one state. */
	isInstalled: boolean;
	/** Installed but disabled: record kept, nothing materialized. */
	isDisabled: boolean;
	isBusy: boolean;
	onOpen: (plugin: PluginCatalogEntry) => void;
	onInstall: (plugin: PluginCatalogEntry) => void;
	onUninstall: (plugin: PluginCatalogEntry) => void;
	onSetEnabled: (name: string, enabled: boolean) => void;
}

export function PluginCard({
	plugin,
	isInstalled,
	isDisabled,
	isBusy,
	onOpen,
	onInstall,
	onUninstall,
	onSetEnabled,
}: PluginCardProps) {
	const { t } = useLingui();
	return (
		// biome-ignore lint/a11y/useSemanticElements: the card nests real buttons (Install, ··· menu); a native <button> cannot contain them
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
				<div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
					{plugin.interface.displayName}
					<PluginKindBadges plugin={plugin} />
					{isInstalled && !isDisabled && (
						<LuCheck className="size-3.5 shrink-0 text-muted-foreground" />
					)}
					{isDisabled && (
						<span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
							<Trans>Disabled</Trans>
						</span>
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
							<Trans>Uninstall</Trans>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			) : (
				<Button
					variant="outline"
					size="sm"
					className="shrink-0 rounded-full"
					disabled={isBusy}
					onClick={(event) => {
						event.stopPropagation();
						onInstall(plugin);
					}}
				>
					<Trans>Install</Trans>
				</Button>
			)}
		</div>
	);
}
