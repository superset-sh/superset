import { eq, or } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { LinearIcon } from "renderer/components/icons/LinearIcon";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface LinkedTaskChipProps {
	slug: string;
}

export function LinkedTaskChip({ slug }: LinkedTaskChipProps) {
	const collections = useCollections();

	const { data: taskData } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.where(({ tasks }) => or(eq(tasks.id, slug), eq(tasks.slug, slug))),
		[collections, slug],
	);

	const title = taskData && taskData.length > 0 ? taskData[0].title : null;

	return (
		<div className="flex items-center gap-2.5 rounded-md border border-border/50 bg-muted/60 px-3 py-2 text-sm select-none">
			<div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground/10 p-0.5">
				<LinearIcon className="size-5 rounded-sm" />
			</div>
			<div className="flex flex-col items-start leading-tight">
				<span className="max-w-[180px] truncate font-medium">
					{title || slug}
				</span>
				<div className="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase tracking-widest">
					<span className="max-w-[80px] truncate">{slug}</span>
					<span>·</span>
					<span>Linear</span>
				</div>
			</div>
		</div>
	);
}
