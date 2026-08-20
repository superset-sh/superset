import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuCopy } from "react-icons/lu";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import type { ReviewTabData } from "../../../../types/review";
import { ReviewFocusList } from "./components/ReviewFocusList";

type SubTab = "review" | "description";

interface ReviewDescriptionPaneProps {
	prBody: string;
	reviewData: ReviewTabData;
}

export function ReviewDescriptionPane({
	prBody,
	reviewData,
}: ReviewDescriptionPaneProps) {
	const [subTab, setSubTab] = useState<SubTab>("review");

	return (
		<div className="flex min-w-0 flex-1 flex-col gap-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					{(["review", "description"] as const).map((tab) => (
						<button
							key={tab}
							type="button"
							onClick={() => setSubTab(tab)}
							className={cn(
								"rounded-lg px-2 py-1 text-xs font-medium capitalize",
								subTab === tab
									? "bg-muted text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{tab}
						</button>
					))}
				</div>
				<button
					type="button"
					disabled
					className="text-muted-foreground/60"
					aria-label="Copy description"
				>
					<LuCopy className="size-4" />
				</button>
			</div>

			{subTab === "review" ? (
				<div className="flex flex-col gap-5">
					<div className="flex flex-col gap-2">
						<h2 className="text-[13px] font-semibold">What the change does?</h2>
						<p className="text-[13px] leading-relaxed text-muted-foreground">
							{reviewData.whatItDoes}
						</p>
					</div>

					<div className="flex flex-col gap-2">
						<h2 className="text-[13px] font-semibold">Key changes</h2>
						<ul className="flex list-none flex-col gap-2">
							{reviewData.keyChanges.map((change) => (
								<li key={change} className="flex items-start gap-2">
									<span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
									<span className="text-[13px] leading-relaxed text-foreground">
										{change}
									</span>
								</li>
							))}
						</ul>
					</div>

					<div className="flex flex-col gap-2">
						<h2 className="text-[13px] font-semibold">Review Focus</h2>
						<ReviewFocusList items={reviewData.reviewFocus} />
					</div>
				</div>
			) : prBody.trim() ? (
				<MarkdownRenderer content={prBody} />
			) : (
				<p className="text-sm italic text-muted-foreground">
					No description provided.
				</p>
			)}
		</div>
	);
}
