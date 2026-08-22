import { Badge } from "@superset/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Spinner } from "@superset/ui/spinner";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { SkillIcon } from "renderer/routes/_authenticated/_dashboard/plugins/components/SkillIcon";

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

	return (
		<Dialog open={skill !== null} onOpenChange={(open) => !open && onClose()}>
			{/* Fixed height so every skill opens the same-size modal; content
			    scrolls. bg-card lifts it off the page background; the sm:
			    variant is needed to beat the dialog's built-in sm:max-w-lg. */}
			<DialogContent className="flex h-[80vh] max-w-4xl flex-col bg-card sm:max-w-4xl">
				<DialogHeader>
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
				{/* zoom scales the whole markdown type ramp down without fighting
				    the renderer's own rem-based stylesheet. */}
				<div className="min-h-0 flex-1 overflow-y-auto [zoom:0.85]">
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
			</DialogContent>
		</Dialog>
	);
}
