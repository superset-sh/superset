import { LuFileText, LuImage, LuVideo } from "react-icons/lu";
import type { EvidenceItem } from "../../../../../../../../types/review";

const EVIDENCE_ICONS = {
	document: LuFileText,
	image: LuImage,
	video: LuVideo,
} as const;

interface EvidenceItemCardProps {
	item: EvidenceItem;
}

export function EvidenceItemCard({ item }: EvidenceItemCardProps) {
	const Icon = EVIDENCE_ICONS[item.kind];

	return (
		<div className="flex w-[85px] shrink-0 flex-col items-center gap-3 rounded-lg bg-[#ececec] p-2 dark:bg-muted">
			<div className="flex h-16 w-full items-center justify-center rounded-md bg-background">
				<Icon className="size-5 text-muted-foreground" />
			</div>
			<span className="text-center text-[13px] font-medium text-foreground">
				{item.label}
			</span>
		</div>
	);
}
