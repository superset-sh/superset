import { LuArrowUpRight, LuChevronRight } from "react-icons/lu";
import type { EvidenceItem } from "../../../../../../types/review";
import { EvidenceItemCard } from "./components/EvidenceItemCard";

const VISIBLE_COUNT = 4;

interface EvidenceSectionProps {
	items: EvidenceItem[];
}

export function EvidenceSection({ items }: EvidenceSectionProps) {
	if (items.length === 0) return null;

	const visible = items.slice(0, VISIBLE_COUNT);
	const remaining = items.length - visible.length;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<span className="flex items-center gap-1.5 text-sm font-medium">
					Evidence
					<span className="flex size-4 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
						{items.length}
					</span>
				</span>
				<button
					type="button"
					disabled
					className="text-muted-foreground/60"
					aria-label="Expand evidence"
				>
					<LuArrowUpRight className="size-4" />
				</button>
			</div>
			<div className="flex gap-2 overflow-x-auto">
				{visible.map((item) => (
					<EvidenceItemCard key={item.id} item={item} />
				))}
			</div>
			{remaining > 0 && (
				<button
					type="button"
					disabled
					className="flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground"
				>
					View All (+{remaining} more)
					<LuChevronRight className="size-4" />
				</button>
			)}
		</div>
	);
}
