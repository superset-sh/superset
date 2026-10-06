import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	LuCheck,
	LuEllipsis,
	LuExternalLink,
	LuFolderOpen,
	LuPause,
	LuPlay,
	LuTrash2,
} from "react-icons/lu";
import { SkillIcon } from "renderer/routes/_authenticated/_dashboard/plugins/components/SkillIcon";
import { useSkillFileActions } from "../../hooks/useSkillFileActions";
import type { SkillListItem } from "../../hooks/useSkills";
import { SkillScopeLabel } from "../SkillScopeLabel";

interface SkillCardProps {
	skill: SkillListItem;
	isBusy: boolean;
	showScope?: boolean;
	showPath?: boolean;
	onOpen: (skill: SkillListItem) => void;
	onDelete: (skill: SkillListItem) => void;
	onSetEnabled: (name: string, enabled: boolean) => void;
}

export function SkillCard({
	skill,
	isBusy,
	showScope = false,
	showPath = false,
	onOpen,
	onDelete,
	onSetEnabled,
}: SkillCardProps) {
	const { t } = useLingui();
	const { openInEditor, revealInFinder } = useSkillFileActions();
	const isManaged = skill.ref.kind === "managed";

	return (
		// biome-ignore lint/a11y/useSemanticElements: the card nests a real button (the ··· menu); a native <button> cannot contain it
		<div
			role="button"
			tabIndex={0}
			onClick={() => onOpen(skill)}
			onKeyDown={(event) => {
				// Only when the card itself is focused — Enter on the nested
				// ··· button must not also open the skill.
				if (event.target !== event.currentTarget) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onOpen(skill);
				}
			}}
			className="flex cursor-pointer items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-fill-hover"
		>
			<SkillIcon
				skillName={skill.name}
				iconDataUri={skill.iconDataUri}
				brandColor={skill.brandColor}
				className="size-9"
			/>
			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
					<span className="truncate">{skill.displayName}</span>
					{showScope && (
						<span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
							<SkillScopeLabel scope={skill.scope} />
						</span>
					)}
					{skill.enabled ? (
						<LuCheck className="size-3.5 shrink-0 text-muted-foreground" />
					) : (
						<span className="shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
							<Trans>Disabled</Trans>
						</span>
					)}
				</div>
				<p className="truncate text-xs text-muted-foreground">
					{skill.shortDescription ?? skill.description}
				</p>
				{showPath && (
					<p className="truncate font-mono text-[10px] text-muted-foreground">
						{skill.displayDir}
					</p>
				)}
			</div>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon-xs"
						className="shrink-0 text-muted-foreground"
						aria-label={t({ message: `${skill.displayName} options` })}
						onClick={(event) => event.stopPropagation()}
					>
						<LuEllipsis className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				{/* Portaled, but React still bubbles the click to the card. */}
				<DropdownMenuContent
					align="end"
					onClick={(event) => event.stopPropagation()}
				>
					<DropdownMenuItem onSelect={() => void openInEditor(skill.path)}>
						<LuExternalLink className="size-4" />
						<Trans>Open in editor</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => void revealInFinder(skill.path)}>
						<LuFolderOpen className="size-4" />
						<Trans>Reveal in Finder</Trans>
					</DropdownMenuItem>
					{isManaged ? (
						<DropdownMenuItem
							disabled={isBusy}
							onSelect={() => onSetEnabled(skill.name, !skill.enabled)}
						>
							{skill.enabled ? (
								<LuPause className="size-4" />
							) : (
								<LuPlay className="size-4" />
							)}
							{skill.enabled ? <Trans>Disable</Trans> : <Trans>Enable</Trans>}
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem
							variant="destructive"
							disabled={isBusy}
							onSelect={() => onDelete(skill)}
						>
							<LuTrash2 className="size-4" />
							<Trans>Delete</Trans>
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
