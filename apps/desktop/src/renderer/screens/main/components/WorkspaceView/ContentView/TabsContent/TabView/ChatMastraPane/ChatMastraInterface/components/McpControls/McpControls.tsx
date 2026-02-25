import { Button } from "@superset/ui/button";
import { McpOverviewPicker } from "../../../../ChatPane/ChatInterface/components/McpOverviewPicker";
import type { UseMcpUiReturn } from "../../hooks/useMcpUi";
import { McpActionPanels } from "../McpActionPanels";

interface McpControlsProps {
	mcpUi: UseMcpUiReturn;
}

export function McpControls({ mcpUi }: McpControlsProps) {
	return (
		<>
			<McpActionPanels
				pendingApproval={mcpUi.pendingApproval}
				pendingQuestion={mcpUi.pendingQuestion}
				pendingPlanApproval={mcpUi.pendingPlanApproval}
				isApprovalPending={mcpUi.isApprovalPending}
				isQuestionPending={mcpUi.isQuestionPending}
				isPlanPending={mcpUi.isPlanPending}
				questionDraft={mcpUi.questionDraft}
				planFeedback={mcpUi.planFeedback}
				onQuestionDraftChange={mcpUi.setQuestionDraft}
				onPlanFeedbackChange={mcpUi.setPlanFeedback}
				onApprove={() => {
					void mcpUi.submitApprovalDecision("approve");
				}}
				onDeny={() => {
					void mcpUi.submitApprovalDecision("deny");
				}}
				onSubmitQuestion={(answer) => {
					void mcpUi.submitQuestionAnswer(answer);
				}}
				onAcceptPlan={() => {
					void mcpUi.submitPlanDecision("accept");
				}}
				onRejectPlan={() => {
					void mcpUi.submitPlanDecision("reject");
				}}
				onRevisePlan={() => {
					void mcpUi.submitPlanDecision("revise");
				}}
			/>
			{mcpUi.overview && (
				<div className="mx-auto w-full max-w-[680px] px-4 pb-1 text-xs text-muted-foreground">
					Loaded MCPs:{" "}
					{mcpUi.overview.servers.length > 0
						? mcpUi.overview.servers.map((server) => server.name).join(", ")
						: "none"}
				</div>
			)}
			<div className="mx-auto flex w-full max-w-[680px] justify-end px-4 pb-2">
				<Button
					size="sm"
					variant="ghost"
					onClick={() => {
						void mcpUi.openOverview();
					}}
					disabled={mcpUi.isOverviewLoading}
				>
					{mcpUi.isOverviewLoading ? "Loading MCP..." : "MCP Servers"}
				</Button>
			</div>
			<McpOverviewPicker
				overview={mcpUi.overview}
				open={mcpUi.overviewOpen}
				onOpenChange={mcpUi.setOverviewOpen}
			/>
		</>
	);
}
