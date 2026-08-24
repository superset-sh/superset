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
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { Switch } from "@superset/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { XIcon } from "lucide-react";
import { useRef } from "react";
import {
	LuCheck,
	LuCopy,
	LuEllipsis,
	LuExternalLink,
	LuFolderOpen,
} from "react-icons/lu";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { SkillIcon } from "renderer/routes/_authenticated/_dashboard/plugins/components/SkillIcon";
import { useSkillMutations } from "../../hooks/useSkillMutations";

interface SkillPreviewDialogProps {
	skill: { name: string; description: string } | null;
	onClose: () => void;
}

export function SkillPreviewDialog({
	skill,
	onClose,
}: SkillPreviewDialogProps) {
	const { data, isLoading } = electronTrpc.plugins.getSkillContent.useQuery(
		{ name: skill?.name ?? "" },
		{ enabled: skill !== null },
	);
	const { disabledSkills, setEnabled, isBusy } = useSkillMutations();
	const isEnabled = skill !== null && !disabledSkills.has(skill.name);
	const { copyToClipboard, copied } = useCopyToClipboard();
	const initialFocusRef = useRef<HTMLDivElement>(null);

	const handleOpen = async () => {
		if (!data?.path) return;
		try {
			await electronTrpcClient.external.openFileInEditor.mutate({
				path: data.path,
			});
		} catch (error) {
			toast.error(
				`Failed to open file: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	};

	const handleRevealInFinder = async () => {
		if (!data?.path) return;
		try {
			await electronTrpcClient.external.openInFinder.mutate(data.path);
		} catch (error) {
			toast.error(
				`Failed to reveal in Finder: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	};

	const handleCopyMarkdown = () => {
		if (!data?.content) return;
		toast.promise(copyToClipboard(data.content), {
			success: "Markdown copied",
			error: (err: unknown) =>
				`Failed to copy markdown: ${err instanceof Error ? err.message : "Unknown error"}`,
		});
	};

	return (
		<Dialog open={skill !== null} onOpenChange={(open) => !open && onClose()}>
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
								<SkillIcon skillName={skill.name} className="size-7" />
							)}
							{skill?.name}
							<Badge
								variant="outline"
								className="h-4 rounded px-1 text-[9px] font-medium tracking-wide text-muted-foreground uppercase"
							>
								Skill
							</Badge>
							<Badge variant="secondary">Managed</Badge>
						</DialogTitle>
						<DialogDescription>{skill?.description}</DialogDescription>
					</DialogHeader>
					<div className="flex shrink-0 items-center gap-3">
						{skill !== null && (
							<Tooltip delayDuration={700}>
								{/* The Switch has its own data-state (checked/unchecked) that
								    its styling depends on; asChild directly on it would let
								    Radix's Slot overwrite that with the tooltip's own
								    data-state, so the trigger target is this inert span instead. */}
								<TooltipTrigger asChild>
									<span className="inline-flex">
										<Switch
											checked={isEnabled}
											disabled={isBusy}
											aria-label={`${skill.name} enabled`}
											onCheckedChange={(checked) =>
												setEnabled(skill.name, checked)
											}
										/>
									</span>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									{isEnabled ? "Disable skill" : "Enable skill"}
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
										aria-label={`${skill.name} actions`}
									>
										<LuEllipsis className="size-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem
										onSelect={handleOpen}
										disabled={!data?.path}
									>
										<LuExternalLink className="size-4" />
										Open
									</DropdownMenuItem>
									<DropdownMenuItem
										onSelect={handleRevealInFinder}
										disabled={!data?.path}
									>
										<LuFolderOpen className="size-4" />
										Reveal in Finder
									</DropdownMenuItem>
									<DropdownMenuItem
										onSelect={handleCopyMarkdown}
										disabled={!data?.content}
									>
										<LuCopy className="size-4" />
										Copy Markdown
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						<DialogClose className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
							<XIcon />
							<span className="sr-only">Close</span>
						</DialogClose>
					</div>
				</div>
				<div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border/60 bg-background">
					{data?.content && (
						<Button
							variant="ghost"
							size="icon-xs"
							className="absolute top-2 right-2 z-10 text-muted-foreground"
							aria-label="Copy markdown"
							onClick={handleCopyMarkdown}
						>
							{copied ? (
								<LuCheck className="size-4" />
							) : (
								<LuCopy className="size-4" />
							)}
						</Button>
					)}
					{/* zoom scales the whole markdown type ramp down without fighting
					    the renderer's own rem-based stylesheet. */}
					<div className="h-full overflow-y-auto p-4 [zoom:0.85]">
						{isLoading ? (
							<div className="flex justify-center py-8">
								<Spinner className="size-5" />
							</div>
						) : data?.content ? (
							<MarkdownRenderer content={data.content} />
						) : (
							<p className="text-sm text-muted-foreground">
								Could not load this skill's content.
							</p>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
