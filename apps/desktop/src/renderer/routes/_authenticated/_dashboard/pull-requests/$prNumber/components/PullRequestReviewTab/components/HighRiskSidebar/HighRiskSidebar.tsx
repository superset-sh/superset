import { LuCopy } from "react-icons/lu";
import type { ReviewTabData } from "../../../../types/review";
import { CommentComposer } from "./components/CommentComposer";
import { EvidenceSection } from "./components/EvidenceSection";
import { OtherChangesSection } from "./components/OtherChangesSection";
import { ReviewCommentsSection } from "./components/ReviewCommentsSection";
import { RiskChapterRow } from "./components/RiskChapterRow";

interface HighRiskSidebarProps {
	data: ReviewTabData;
}

export function HighRiskSidebar({ data }: HighRiskSidebarProps) {
	const highRiskChapters = data.chapters.filter(
		(chapter) => chapter.riskLevel === "high",
	);
	const otherChapters = data.chapters.filter(
		(chapter) => chapter.riskLevel !== "high",
	);

	return (
		<div className="flex flex-col gap-5">
			<div>
				<div className="mb-2 flex items-center justify-between">
					<span className="text-sm font-medium text-muted-foreground">
						High Risk
					</span>
					<button
						type="button"
						disabled
						className="text-muted-foreground/60"
						aria-label="Copy high-risk summary"
					>
						<LuCopy className="size-4" />
					</button>
				</div>
				{highRiskChapters.length > 0 ? (
					<ol className="flex list-none flex-col gap-2">
						{highRiskChapters.map((chapter) => (
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
				) : (
					<p className="text-[13px] text-muted-foreground">
						No high-risk changes detected in this pull request.
					</p>
				)}
				<div className="mt-2">
					<OtherChangesSection chapters={otherChapters} />
				</div>
			</div>

			<EvidenceSection items={data.evidence} />
			<ReviewCommentsSection comments={data.comments} />
			<CommentComposer />
		</div>
	);
}
