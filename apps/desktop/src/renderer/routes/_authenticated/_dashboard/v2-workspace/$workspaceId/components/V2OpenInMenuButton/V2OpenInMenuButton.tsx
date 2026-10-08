import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { OverflowFadeText } from "@superset/ui/overflow-fade-text";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { VscChevronDown } from "react-icons/vsc";
import { OpenInExternalDropdownItems } from "renderer/components/OpenInExternalDropdown";
import { HotkeyLabel } from "renderer/hotkeys";
import { useWorkspaceOpenIn } from "../../hooks/useWorkspaceOpenIn";

interface V2OpenInMenuButtonProps {
	worktreePath: string;
	branch: string;
	/** Null for project-less "session" workspaces (no per-project default app). */
	projectId: string | null;
}

export function V2OpenInMenuButton({
	worktreePath,
	branch,
	projectId,
}: V2OpenInMenuButtonProps) {
	const { t } = useLingui();
	const {
		resolvedApp,
		currentApp,
		isDark,
		isLoading,
		openInShortcut,
		copyPathShortcut,
		openInDefaultApp,
		openInOtherApp,
		copyWorktreePath,
	} = useWorkspaceOpenIn({ worktreePath, projectId });

	return (
		<div className="flex items-center no-drag">
			<Tooltip delayDuration={1000}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={openInDefaultApp}
						disabled={isLoading || !currentApp}
						aria-label={
							currentApp
								? t({
										message: `Open in ${currentApp.displayLabel ?? currentApp.label}`,
									})
								: t({
										message: "Open in editor",
									})
						}
						className={cn(
							// Icon-only when the nearest @container is narrow; the branch
							// label comes back once there's room (right sidebar is resizable,
							// so viewport breakpoints don't apply here). The threshold is
							// higher than the PR badge's so the badge (with its merge
							// chevron) keeps space priority and never clips in the 240-320px
							// dead zone (#6385).
							"group flex h-6 items-center justify-center gap-1.5 rounded-l border border-r-0 border-border/60 bg-secondary/50 px-1.5 text-xs font-medium @[320px]:pr-2",
							"transition-all duration-150 ease-out",
							"hover:bg-secondary hover:border-border",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							"active:scale-[0.98]",
							isLoading && "opacity-50 pointer-events-none",
						)}
					>
						{currentApp && (
							<img
								src={isDark ? currentApp.darkIcon : currentApp.lightIcon}
								alt=""
								className="size-3.5 object-contain shrink-0"
							/>
						)}
						{branch && (
							<OverflowFadeText
								className="hidden max-w-[140px] text-muted-foreground tabular-nums @[320px]:inline-block"
								title={branch}
							>
								/{branch}
							</OverflowFadeText>
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={6}>
					{currentApp ? (
						<HotkeyLabel
							label={t({
								message: `Open in ${currentApp.displayLabel ?? currentApp.label}`,
							})}
							id="OPEN_IN_APP"
						/>
					) : (
						<Trans>Select an editor from the dropdown</Trans>
					)}
				</TooltipContent>
			</Tooltip>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						disabled={isLoading}
						className={cn(
							"flex items-center justify-center h-6 w-6 rounded-r border border-border/60 bg-secondary/50 text-muted-foreground",
							"transition-all duration-150 ease-out",
							"hover:bg-secondary hover:border-border hover:text-foreground",
							"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
							"active:scale-[0.98]",
							isLoading && "opacity-50 pointer-events-none",
						)}
					>
						<VscChevronDown className="size-3" />
					</button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end" className="w-48">
					<OpenInExternalDropdownItems
						isDark={isDark}
						activeApp={resolvedApp}
						onOpenIn={openInOtherApp}
						onCopyPath={copyWorktreePath}
						renderAppTrailing={(appId, group) => {
							if (
								appId !== resolvedApp ||
								!openInShortcut ||
								group === "jetbrains"
							) {
								return null;
							}
							return (
								<DropdownMenuShortcut>{openInShortcut}</DropdownMenuShortcut>
							);
						}}
						copyPathTrailing={
							copyPathShortcut ? (
								<DropdownMenuShortcut>{copyPathShortcut}</DropdownMenuShortcut>
							) : null
						}
						subContentClassName="w-40"
						appContentClassName="gap-0"
						appIconClassName="size-4 object-contain mr-2"
						subTriggerIconClassName="size-4 object-contain mr-2"
						subTriggerContentClassName="flex items-center gap-0"
						copyPathContentClassName="gap-0"
						copyPathIconClassName="mr-2"
					/>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
