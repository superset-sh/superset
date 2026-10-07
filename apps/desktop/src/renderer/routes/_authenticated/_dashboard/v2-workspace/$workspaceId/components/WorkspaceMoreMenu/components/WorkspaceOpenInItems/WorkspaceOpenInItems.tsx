import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenuItem,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import { SquareArrowOutUpRight } from "lucide-react";
import { OpenInExternalDropdownItems } from "renderer/components/OpenInExternalDropdown";
import type { WorkspaceOpenIn } from "../../../../hooks/useWorkspaceOpenIn";

interface WorkspaceOpenInItemsProps {
	openIn: WorkspaceOpenIn;
}

export function WorkspaceOpenInItems({ openIn }: WorkspaceOpenInItemsProps) {
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
	} = openIn;

	return (
		<>
			{currentApp && (
				<DropdownMenuItem disabled={isLoading} onClick={openInDefaultApp}>
					<img
						src={isDark ? currentApp.darkIcon : currentApp.lightIcon}
						alt=""
						className="size-4 object-contain"
					/>
					{t({
						message: `Open in ${currentApp.displayLabel ?? currentApp.label}`,
					})}
					{openInShortcut && (
						<DropdownMenuShortcut>{openInShortcut}</DropdownMenuShortcut>
					)}
				</DropdownMenuItem>
			)}
			<DropdownMenuSub>
				<DropdownMenuSubTrigger>
					<SquareArrowOutUpRight className="size-4 text-muted-foreground" />
					<Trans>Open in</Trans>
				</DropdownMenuSubTrigger>
				<DropdownMenuSubContent className="min-w-48">
					<OpenInExternalDropdownItems
						isDark={isDark}
						activeApp={resolvedApp}
						onOpenIn={openInOtherApp}
						onCopyPath={copyWorktreePath}
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
				</DropdownMenuSubContent>
			</DropdownMenuSub>
		</>
	);
}
