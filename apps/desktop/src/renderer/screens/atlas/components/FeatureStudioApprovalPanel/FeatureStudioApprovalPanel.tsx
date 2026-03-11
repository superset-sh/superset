import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";

type ApprovalMode = "spec_plan" | "human_qa" | "registration";

interface ApprovalResponseInput {
	feedback?: string;
}

interface FeatureStudioApprovalPanelProps {
	mode: ApprovalMode;
	title?: string;
	description?: string;
	isSubmitting?: boolean;
	onApprove: (input: ApprovalResponseInput) => void | Promise<void>;
	onReject: (input: ApprovalResponseInput) => void | Promise<void>;
	onDiscard?: (input: ApprovalResponseInput) => void | Promise<void>;
}

const COPY: Record<
	ApprovalMode,
	{
		approve: string;
		reject: string;
		discard: string;
		placeholder: string;
	}
> = {
	spec_plan: {
		approve: "승인",
		reject: "수정 요청",
		discard: "폐기",
		placeholder: "Spec/Plan 검토 메모를 남깁니다.",
	},
	human_qa: {
		approve: "커스터마이징 진행",
		reject: "수정 요청",
		discard: "폐기",
		placeholder: "프리뷰 검토 메모를 남깁니다.",
	},
	registration: {
		approve: "등록 승인",
		reject: "등록 보류",
		discard: "폐기",
		placeholder: "등록 검토 메모를 남깁니다.",
	},
};

export function FeatureStudioApprovalPanel({
	mode,
	title,
	description,
	isSubmitting = false,
	onApprove,
	onReject,
	onDiscard,
}: FeatureStudioApprovalPanelProps) {
	const [feedback, setFeedback] = useState("");
	const copy = COPY[mode];

	const buildPayload = () => {
		const trimmed = feedback.trim();
		return trimmed ? { feedback: trimmed } : {};
	};

	return (
		<div className="space-y-3 rounded-xl border border-border bg-background p-4">
			<div className="space-y-1">
				{title ? <p className="text-sm font-medium">{title}</p> : null}
				{description ? (
					<p className="text-xs text-muted-foreground">{description}</p>
				) : null}
			</div>

			<Textarea
				value={feedback}
				onChange={(event) => setFeedback(event.target.value)}
				placeholder={copy.placeholder}
				rows={4}
				disabled={isSubmitting}
			/>

			<div className="flex flex-wrap items-center justify-end gap-2">
				{onDiscard ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={isSubmitting}
						onClick={() => {
							void onDiscard(buildPayload());
						}}
					>
						{copy.discard}
					</Button>
				) : null}
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={isSubmitting}
					onClick={() => {
						void onReject(buildPayload());
					}}
				>
					{copy.reject}
				</Button>
				<Button
					type="button"
					size="sm"
					disabled={isSubmitting}
					onClick={() => {
						void onApprove(buildPayload());
					}}
				>
					{copy.approve}
				</Button>
			</div>
		</div>
	);
}
