import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { XIcon } from "lucide-react";
import { useRef } from "react";
import {
	LuCopy,
	LuEllipsis,
	LuExternalLink,
	LuFolderOpen,
	LuTrash2,
} from "react-icons/lu";
import { FileEditPane } from "renderer/components/FileEditPane";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { SkillIcon } from "renderer/routes/_authenticated/_dashboard/plugins/components/SkillIcon";
import { useSkillFileActions } from "../../hooks/useSkillFileActions";
import type { SkillListItem } from "../../hooks/useSkills";
import { SkillScopeLabel } from "../SkillScopeLabel";
import { useSkillDocument } from "./hooks/useSkillDocument";

interface SkillPreviewDialogProps {
	skill: SkillListItem | null;
	isBusy: boolean;
	onClose: () => void;
	onDelete: (skill: SkillListItem) => void;
	onSetEnabled: (name: string, enabled: boolean) => void;
}

export function SkillPreviewDialog({
	skill,
	isBusy,
	onClose,
	onDelete,
	onSetEnabled,
}: SkillPreviewDialogProps) {
	const { t } = useLingui();
	const { document, path } = useSkillDocument({ skill });
	const { openInEditor, revealInFinder } = useSkillFileActions();
	const { copyToClipboard } = useCopyToClipboard();
	const initialFocusRef = useRef<HTMLDivElement>(null);
	const isManaged = skill?.ref.kind === "managed";

	const handleCopyMarkdown = () => {
		if (document.content.kind !== "text") return;
		toast.promise(copyToClipboard(document.content.value), {
			success: t({ message: "Markdown copied" }),
			error: (err: unknown) =>
				t({
					message: `Failed to copy markdown: ${errorMessage(
						err,
						t({ message: "Unknown error" }),
					)}`,
				}),
		});
	};

	// Simplest safe default for a low-stakes local file: save silently on
	// close instead of prompting. `document` still reflects the skill that
	// was open (skill flips to null only after this handler returns).
	const handleOpenChange = (open: boolean) => {
		if (open) return;
		if (document.dirty) {
			void document.save();
		}
		onClose();
	};

	return (
		<Dialog open={skill !== null} onOpenChange={handleOpenChange}>
			{/* Fixed height so every skill opens the same-size modal; content
			    scrolls. bg-card lifts it off the page background; the sm:
			    variant is needed to beat the dialog's built-in sm:max-w-lg. */}
			<DialogContent
				showCloseButton={false}
				// Left to Radix's default, autofocus lands on the Switch (the first
				// focusable element in the header row), which also opens its
				// tooltip via :focus even though the user never hovered it. Redirect
				// focus to the header row itself instead of just suppressing it, so
				// keyboard/screen-reader users still land inside the dialog.
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					initialFocusRef.current?.focus();
				}}
				className="flex h-[80vh] max-w-4xl flex-col bg-card sm:max-w-4xl"
			>
				<div
					ref={initialFocusRef}
					tabIndex={-1}
					className="flex items-start justify-between gap-3 outline-none"
				>
					<DialogHeader className="flex-1">
						<DialogTitle className="flex items-center gap-2">
							{skill !== null && (
								<SkillIcon
									skillName={skill.name}
									iconDataUri={skill.iconDataUri}
									brandColor={skill.brandColor}
									className="size-7"
								/>
							)}
							{skill?.displayName}
							<Badge
								variant="outline"
								className="h-4 rounded px-1 text-[9px] font-medium tracking-wide text-muted-foreground uppercase"
							>
								<Trans>Skill</Trans>
							</Badge>
							{skill !== null && (
								<Badge variant="secondary">
									<SkillScopeLabel scope={skill.scope} />
								</Badge>
							)}
						</DialogTitle>
						<DialogDescription>{skill?.description}</DialogDescription>
						{skill !== null && (
							<p className="truncate font-mono text-xs text-muted-foreground">
								{skill.displayDir}
							</p>
						)}
					</DialogHeader>
					<div className="flex shrink-0 items-center gap-3">
						{skill !== null && isManaged && (
							<Tooltip delayDuration={700}>
								{/* The Switch has its own data-state (checked/unchecked) that
								    its styling depends on; asChild directly on it would let
								    Radix's Slot overwrite that with the tooltip's own
								    data-state, so the trigger target is this inert span instead. */}
								<TooltipTrigger asChild>
									<span className="inline-flex">
										<Switch
											checked={skill.enabled}
											disabled={isBusy}
											aria-label={t({
												message: `${skill.displayName} enabled`,
											})}
											onCheckedChange={(checked) =>
												onSetEnabled(skill.name, checked)
											}
										/>
									</span>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									{skill.enabled ? (
										<Trans>Disable skill</Trans>
									) : (
										<Trans>Enable skill</Trans>
									)}
								</TooltipContent>
							</Tooltip>
						)}
						{skill !== null && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="icon-xs"
										className="text-muted-foreground"
										aria-label={t({ message: `${skill.displayName} actions` })}
									>
										<LuEllipsis className="size-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem
										onSelect={() => void openInEditor(path ?? skill.path)}
									>
										<LuExternalLink className="size-4" />
										<Trans>Open in editor</Trans>
									</DropdownMenuItem>
									<DropdownMenuItem
										onSelect={() => void revealInFinder(path ?? skill.path)}
									>
										<LuFolderOpen className="size-4" />
										<Trans>Reveal in Finder</Trans>
									</DropdownMenuItem>
									<DropdownMenuItem
										onSelect={handleCopyMarkdown}
										disabled={document.content.kind !== "text"}
									>
										<LuCopy className="size-4" />
										<Trans>Copy Markdown</Trans>
									</DropdownMenuItem>
									{!isManaged && (
										<>
											<DropdownMenuSeparator />
											<DropdownMenuItem
												variant="destructive"
												disabled={isBusy}
												onSelect={() => onDelete(skill)}
											>
												<LuTrash2 className="size-4" />
												<Trans>Delete</Trans>
											</DropdownMenuItem>
										</>
									)}
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						<DialogClose className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
							<XIcon />
							<span className="sr-only">
								<Trans>Close</Trans>
							</span>
						</DialogClose>
					</div>
				</div>
				<div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border/60 bg-background">
					{skill !== null && (
						<FileEditPane document={document} filePath={path ?? skill.path} />
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
