import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { Globe, Link2, Lock, MoreVertical, Pin, PinOff } from "lucide-react";
import type { MouseEvent } from "react";
import { PageThumbnail } from "./components/PageThumbnail";

export interface PageCardItem {
	id: string;
	slug: string;
	title: string;
	url: string;
	visibility: string;
	createdAt: Date | string;
	updatedAt: Date | string;
}

interface PageCardProps {
	page: PageCardItem;
	isPinned: boolean;
	onOpen: (page: PageCardItem, event: MouseEvent) => void;
	onTogglePin: (pageId: string) => void;
}

export function PageCard({
	page,
	isPinned,
	onOpen,
	onTogglePin,
}: PageCardProps) {
	const isShared = page.visibility === "org";
	const VisibilityIcon = isShared ? Globe : Lock;
	const edited = new Date(page.updatedAt).getTime();
	const created = new Date(page.createdAt).getTime();
	const wasEdited = edited - created > 60_000;
	const timestamp = formatDistanceToNowStrict(
		new Date(wasEdited ? edited : created),
		{
			addSuffix: true,
		},
	);

	const copyLink = async () => {
		try {
			await navigator.clipboard.writeText(page.url);
			toast.success("Link copied");
		} catch {
			toast.error("Could not copy the link");
		}
	};

	return (
		<div className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-muted-foreground/30">
			<button
				type="button"
				onClick={(event) => onOpen(page, event)}
				className="flex flex-1 flex-col text-left"
			>
				<PageThumbnail slug={page.slug} pageId={page.id} />
				<div className="flex flex-col gap-1 border-border/60 border-t px-3 py-2.5">
					<span className="truncate font-medium text-sm">{page.title}</span>
					<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
						<VisibilityIcon className="size-3 shrink-0" />
						<span aria-hidden="true">·</span>
						<span className="truncate">
							{wasEdited ? "Edited" : "Created"} {timestamp}
						</span>
					</span>
				</div>
			</button>

			{isPinned && (
				<Pin className="absolute top-2 left-2 size-3.5 fill-current text-muted-foreground" />
			)}

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={`Actions for ${page.title}`}
						className={cn(
							"absolute top-2 right-2 size-7 bg-background/80 backdrop-blur transition-opacity",
							"opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100",
						)}
					>
						<MoreVertical className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onSelect={() => onTogglePin(page.id)}>
						{isPinned ? (
							<PinOff className="size-4" />
						) : (
							<Pin className="size-4" />
						)}
						{isPinned ? "Unpin" : "Pin"}
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => void copyLink()}>
						<Link2 className="size-4" />
						Copy link
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
