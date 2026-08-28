import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Separator } from "@superset/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import {
	LuBuilding2,
	LuCheck,
	LuLink2,
	LuLock,
	LuShare2,
} from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

interface ReviewSharePopoverProps {
	prUrl: string;
}

/**
 * Surfaces the AI code review already published for this PR (via
 * `reviews_publish` — an external, agent-driven action, not something this
 * view can trigger itself: it has no findings to publish). Reviews reuse the
 * generic Pages table, so visibility is changed through `page.setVisibility`
 * the same way the Pages share popover does.
 */
export function ReviewSharePopover({ prUrl }: ReviewSharePopoverProps) {
	const [open, setOpen] = useState(false);
	const { copyToClipboard, copied } = useCopyToClipboard();

	const review = cloudTrpc.review.getForPullRequest.useQuery(
		{ prUrl },
		{ enabled: Boolean(prUrl) },
	);
	const setVisibility = cloudTrpc.page.setVisibility.useMutation({
		onSuccess: () => void review.refetch(),
	});

	const page = review.data;
	const iconButton = (
		<Button
			variant="ghost"
			size="icon-sm"
			disabled={!page}
			aria-label={page ? "Share AI review" : "No AI review shared yet"}
		>
			<LuShare2 className="size-4" />
		</Button>
	);

	if (!page) {
		return (
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					{/* A disabled button still lets a wrapping span pick up the
					    hover that opens the tooltip. */}
					<span>{iconButton}</span>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{review.isLoading
						? "Checking for a shared review…"
						: "No AI review has been shared for this PR yet"}
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{iconButton}</PopoverTrigger>
			<PopoverContent align="end" className="w-80 p-0">
				<div className="flex items-center justify-between gap-2 px-3 py-2.5">
					<span className="min-w-0 truncate font-medium text-sm">
						{page.title}
					</span>
					<Button
						size="xs"
						variant="ghost"
						onClick={() => void copyToClipboard(page.url)}
					>
						{copied ? (
							<LuCheck className="size-3.5 text-primary" />
						) : (
							<LuLink2 className="size-3.5" />
						)}
						{copied ? "Copied" : "Copy link"}
					</Button>
				</div>
				<Separator />
				<div className="space-y-2 px-3 py-2.5">
					<div className="space-y-0.5">
						<Label className="font-medium text-sm">General access</Label>
						<p className="text-muted-foreground text-xs">
							Who can open this review from its link
						</p>
					</div>
					<Select
						value={page.visibility}
						disabled={setVisibility.isPending}
						onValueChange={(value) =>
							setVisibility.mutate({
								id: page.id,
								visibility: value as "just_me" | "org",
							})
						}
					>
						<SelectTrigger size="sm" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="just_me">
								<LuLock className="size-3.5 text-muted-foreground" />
								Only you
							</SelectItem>
							<SelectItem value="org">
								<LuBuilding2 className="size-3.5 text-muted-foreground" />
								Anyone in your organization
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</PopoverContent>
		</Popover>
	);
}
