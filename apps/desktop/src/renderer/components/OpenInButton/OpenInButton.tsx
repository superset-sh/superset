import type { ExternalApp } from "@superset/local-db";
import { Button } from "@superset/ui/button";
import { ButtonGroup } from "@superset/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { HiChevronDown } from "react-icons/hi2";
import {
	getAppOption,
	OpenInExternalDropdownItems,
} from "renderer/components/OpenInExternalDropdown";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useThemeStore } from "renderer/stores";
import { useHotkeyText } from "renderer/stores/hotkeys";

export interface OpenInButtonProps {
	path: string | undefined;
	/** Optional label to show next to the icon (e.g., folder name) */
	label?: string;
	/** Show keyboard shortcut hints */
	showShortcuts?: boolean;
	/** Project ID for per-project default app */
	projectId?: string;
}

export function OpenInButton({
	path,
	label,
	showShortcuts = false,
	projectId,
}: OpenInButtonProps) {
	const activeTheme = useThemeStore((state) => state.activeTheme);
	const [isOpen, setIsOpen] = useState(false);
	const utils = electronTrpc.useUtils();
	const openInShortcut = useHotkeyText("OPEN_IN_APP");
	const copyPathShortcut = useHotkeyText("COPY_PATH");

	const showOpenInShortcut = showShortcuts && openInShortcut !== "Unassigned";
	const showCopyPathShortcut =
		showShortcuts && copyPathShortcut !== "Unassigned";

	const { data: defaultApp } = electronTrpc.projects.getDefaultApp.useQuery(
		{ projectId: projectId as string },
		{ enabled: !!projectId },
	);

	const openInApp = electronTrpc.external.openInApp.useMutation({
		onSuccess: () => {
			if (projectId) {
				utils.projects.getDefaultApp.invalidate({ projectId });
			}
		},
	});
	const copyPath = electronTrpc.external.copyPath.useMutation();

	const currentApp = defaultApp ? (getAppOption(defaultApp) ?? null) : null;

	const isDark = activeTheme?.type === "dark";
	const currentAppIcon = currentApp?.[isDark ? "darkIcon" : "lightIcon"];
	const handleOpenIn = (app: ExternalApp) => {
		if (!path) return;
		openInApp.mutate({ path, app, projectId });
		setIsOpen(false);
	};

	const handleCopyPath = () => {
		if (!path) return;
		copyPath.mutate(path);
		setIsOpen(false);
	};

	const handleOpenLastUsed = () => {
		if (!path || !defaultApp) return;
		openInApp.mutate({ path, app: defaultApp, projectId });
	};

	return (
		<ButtonGroup>
			{label && currentApp && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className="gap-1.5"
							onClick={handleOpenLastUsed}
							disabled={!path}
						>
							<img
								src={currentAppIcon}
								alt=""
								className="size-4 object-contain"
							/>
							<span className="font-medium">{label}</span>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						{`Open in ${currentApp.displayLabel ?? currentApp.label}${
							showOpenInShortcut ? ` (${openInShortcut})` : ""
						}`}
					</TooltipContent>
				</Tooltip>
			)}
			<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="gap-1"
						disabled={!path}
					>
						<span>Open</span>
						<HiChevronDown className="size-3" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<OpenInExternalDropdownItems
						isDark={isDark}
						activeApp={defaultApp ?? undefined}
						onOpenIn={handleOpenIn}
						onCopyPath={handleCopyPath}
						renderAppTrailing={(appId, group) => {
							if (appId !== defaultApp) return null;
							if (group === "vscode") {
								if (!showShortcuts) return null;
								return (
									<span className="text-xs text-muted-foreground">⌘O</span>
								);
							}
							if (!showOpenInShortcut) return null;
							return (
								<span className="text-xs text-muted-foreground">
									{openInShortcut}
								</span>
							);
						}}
						copyPathTrailing={
							showCopyPathShortcut ? (
								<span className="text-xs text-muted-foreground">
									{copyPathShortcut}
								</span>
							) : null
						}
						appItemClassName="flex items-center justify-between"
						subTriggerClassName="flex items-center gap-2"
						subContentClassName="w-48"
						copyPathItemClassName="flex items-center justify-between"
					/>
				</DropdownMenuContent>
			</DropdownMenu>
		</ButtonGroup>
	);
}
