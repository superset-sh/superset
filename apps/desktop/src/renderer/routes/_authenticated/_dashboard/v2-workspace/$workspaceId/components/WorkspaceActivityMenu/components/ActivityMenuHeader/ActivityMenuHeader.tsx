import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Ellipsis } from "lucide-react";
import { useRef, useState } from "react";
import {
	VscGitCommit,
	VscGitPullRequestCreate,
	VscRepoPush,
} from "react-icons/vsc";

export type ShipView = "commit" | "pr";

const MENU_WIDTH = 224;
const MENU_GAP = 8;

interface MenuPlacement {
	side: "left" | "bottom";
	offset: number;
}

interface ActivityMenuHeaderProps {
	title: string;
	canCommit: boolean;
	canPush: boolean;
	canCreatePr: boolean;
	hasCommitsAhead: boolean;
	isBusy: boolean;
	onOpenView: (view: ShipView) => void;
	onPush: () => void;
	onNoCommitsAhead: () => void;
}

export function ActivityMenuHeader({
	title,
	canCommit,
	canPush,
	canCreatePr,
	hasCommitsAhead,
	isBusy,
	onOpenView,
	onPush,
	onNoCommitsAhead,
}: ActivityMenuHeaderProps) {
	const { t } = useLingui();
	// Opening a form from a menu item has to wait for the menu's focus scope
	// to close, or the menu takes focus back from the form's autofocused field.
	const pendingViewRef = useRef<ShipView | null>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const [placement, setPlacement] = useState<MenuPlacement>({
		side: "bottom",
		offset: 4,
	});
	const hasActions = canCommit || canPush || canCreatePr;

	return (
		<div className="flex h-8 items-center justify-between gap-2 pl-2 pr-1">
			<span className="min-w-0 truncate text-xs text-muted-foreground">
				{title}
			</span>
			{hasActions && (
				<DropdownMenu
					onOpenChange={(open) => {
						const trigger = triggerRef.current;
						const panel = trigger?.closest("[data-slot=popover-content]");
						if (!open || !trigger || !panel) return;
						const panelLeft = panel.getBoundingClientRect().left;
						setPlacement(
							panelLeft >= MENU_WIDTH + MENU_GAP * 2
								? {
										side: "left",
										offset:
											trigger.getBoundingClientRect().left -
											panelLeft +
											MENU_GAP,
									}
								: { side: "bottom", offset: 4 },
						);
					}}
				>
					<DropdownMenuTrigger asChild>
						<button
							ref={triggerRef}
							type="button"
							aria-label={t({ message: "More actions" })}
							className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:bg-accent data-[state=open]:bg-accent data-[state=open]:text-foreground"
						>
							<Ellipsis className="size-4" strokeWidth={1.5} />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						side={placement.side}
						align={placement.side === "left" ? "start" : "end"}
						sideOffset={placement.offset}
						className="w-56"
						onCloseAutoFocus={(event) => {
							const pending = pendingViewRef.current;
							if (!pending) return;
							pendingViewRef.current = null;
							event.preventDefault();
							onOpenView(pending);
						}}
					>
						{canCommit && (
							<DropdownMenuItem
								disabled={isBusy}
								onClick={() => {
									pendingViewRef.current = "commit";
								}}
							>
								<VscGitCommit className="size-4" />
								<Trans>Commit</Trans>
							</DropdownMenuItem>
						)}
						{canPush && (
							<DropdownMenuItem disabled={isBusy} onClick={onPush}>
								<VscRepoPush className="size-4" />
								<Trans>Push</Trans>
							</DropdownMenuItem>
						)}
						{canCreatePr && (
							<DropdownMenuItem
								disabled={isBusy}
								className={
									hasCommitsAhead
										? undefined
										: "text-muted-foreground focus:text-muted-foreground"
								}
								onClick={() => {
									if (!hasCommitsAhead) {
										onNoCommitsAhead();
										return;
									}
									pendingViewRef.current = "pr";
								}}
							>
								<VscGitPullRequestCreate className="size-4" />
								<Trans>Create PR</Trans>
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
}
