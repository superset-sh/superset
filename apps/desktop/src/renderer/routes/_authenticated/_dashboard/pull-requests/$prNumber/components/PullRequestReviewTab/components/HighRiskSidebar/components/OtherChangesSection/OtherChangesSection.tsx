import { useState } from "react";
import { LuChevronRight } from "react-icons/lu";
import { CollapsibleRow } from "renderer/screens/main/components/WorkspaceView/RightSidebar/ChangesView/components/CollapsibleRow";
import type { ReviewChapter } from "../../../../../../types/review";
import { RiskChapterRow } from "../RiskChapterRow";

interface OtherChangesSectionProps {
	chapters: ReviewChapter[];
}

export function OtherChangesSection({ chapters }: OtherChangesSectionProps) {
	const [isExpanded, setIsExpanded] = useState(false);

	if (chapters.length === 0) return null;

	return (
		<CollapsibleRow
			isExpanded={isExpanded}
			onToggle={setIsExpanded}
			showChevron={false}
			triggerClassName="justify-between px-0 py-1 hover:bg-transparent"
			contentClassName="overflow-hidden transition-[height] duration-200 ease-out data-[state=closed]:h-0 data-[state=open]:h-[var(--radix-collapsible-content-height)]"
			header={
				<span className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground">
					<span>Other Changes</span>
					<LuChevronRight
						className={`size-4 shrink-0 transition-transform duration-150 ${
							isExpanded ? "rotate-90" : ""
						}`}
					/>
				</span>
			}
		>
			<ol className="flex list-none flex-col gap-2 pt-2">
				{chapters.map((chapter) => (
					<RiskChapterRow
						key={chapter.id}
						order={chapter.order}
						title={chapter.title}
						additions={chapter.additions}
						deletions={chapter.deletions}
						riskLevel={chapter.riskLevel}
					/>
				))}
			</ol>
		</CollapsibleRow>
	);
}
