import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Separator } from "@superset/ui/separator";
import { FeatureStudioApprovalPanel } from "../FeatureStudioApprovalPanel";
import { FeatureStudioPreviewCard } from "../FeatureStudioPreviewCard";

type ArtifactKind =
	| "spec"
	| "plan"
	| "implementation_summary"
	| "verification_report"
	| "agent_qa_report"
	| "human_qa_notes"
	| "registration_manifest"
	| "preview_metadata";

interface FeatureStudioRequestDetailProps {
	request: {
		id: string;
		title: string;
		status: string;
		summary: string | null;
		rawPrompt: string;
		rulesetReference: string | null;
		messages?: Array<{
			id: string;
			role: string;
			content: string;
			createdAt: string | Date;
		}>;
		approvals?: Array<{
			id: string;
			approvalType: string;
			status: string;
			decisionNotes?: string | null;
		}>;
		artifacts?: Array<{
			id: string;
			kind: ArtifactKind;
			version: number;
			content: string;
			metadata?: Record<string, unknown> | null;
			createdAt?: string | Date;
		}>;
		worktrees?: Array<{
			id: string;
			branchName: string;
			previewUrl: string | null;
			previewStatus: string | null;
			headCommitSha?: string | null;
			lastVerifiedCommitSha?: string | null;
			previewCommitSha?: string | null;
		}>;
	};
	onAdvance: () => void;
	onRequestRegistrationApproval: () => void;
	onRegister: () => void;
	onApprovalAction: (
		approvalId: string,
		action: "approved" | "rejected" | "discarded",
		feedback?: string,
	) => void;
}

interface AgentQaReport {
	previewUrl: string;
	summary: string;
	checks: Array<{
		label: string;
		status: "passed" | "failed";
		note?: string;
	}>;
}

export function FeatureStudioRequestDetail({
	request,
	onAdvance,
	onRequestRegistrationApproval,
	onRegister,
	onApprovalAction,
}: FeatureStudioRequestDetailProps) {
	const latestWorktree = request.worktrees?.[0] ?? null;
	const pendingApprovals =
		request.approvals?.filter((approval) => approval.status === "pending") ?? [];
	const humanQaApproval =
		pendingApprovals.find((approval) => approval.approvalType === "human_qa") ??
		null;
	const otherPendingApprovals = pendingApprovals.filter(
		(approval) => approval.id !== humanQaApproval?.id,
	);
	const specArtifact = getLatestArtifact(request.artifacts, "spec");
	const planArtifact = getLatestArtifact(request.artifacts, "plan");
	const humanQaNotesArtifact = getLatestArtifact(request.artifacts, "human_qa_notes");
	const agentQaReport = parseAgentQaReport(
		getLatestArtifact(request.artifacts, "agent_qa_report")?.content,
	);

	const canRequestRegistration = request.status === "customization";
	const canRegister = request.status === "pending_registration";
	const showAdvanceButton =
		request.status === "draft" ||
		request.status === "plan_approved" ||
		request.status === "customization";

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<h1 className="text-xl font-semibold">{request.title}</h1>
						<Badge variant="outline">
							{request.status.replaceAll("_", " ")}
						</Badge>
					</div>
					<p className="text-sm text-muted-foreground">
						{request.summary ?? "요약이 아직 없습니다."}
					</p>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					{showAdvanceButton ? (
						<Button variant="outline" size="sm" onClick={onAdvance}>
							{request.status === "customization"
								? "다음 단계 진행"
								: "진행"}
						</Button>
					) : null}
					{canRequestRegistration ? (
						<Button
							variant="outline"
							size="sm"
							onClick={onRequestRegistrationApproval}
						>
							등록 승인 요청
						</Button>
					) : null}
					{canRegister ? (
						<Button size="sm" onClick={onRegister}>
							등록
						</Button>
					) : null}
				</div>
			</div>

			{request.status === "customization" ? (
				<div className="rounded-xl border border-border bg-muted/30 p-4">
					<p className="text-sm font-medium">Customization 단계</p>
					<p className="mt-1 text-sm text-muted-foreground">
						사람 또는 에이전트가 수정한 뒤 등록 승인 요청으로 넘길 수 있습니다.
					</p>
				</div>
			) : null}

			{latestWorktree?.previewUrl ? (
				<FeatureStudioPreviewCard
					previewUrl={latestWorktree.previewUrl}
					branchName={latestWorktree.branchName}
					previewStatus={latestWorktree.previewStatus}
					commitSha={
						latestWorktree.lastVerifiedCommitSha ??
						latestWorktree.previewCommitSha ??
						latestWorktree.headCommitSha ??
						null
					}
					agentQaSummary={agentQaReport?.summary ?? null}
					agentQaChecks={agentQaReport?.checks}
					primaryActionLabel={
						humanQaApproval ? "커스터마이징 진행" : undefined
					}
					secondaryActionLabel={humanQaApproval ? "수정 요청" : undefined}
					onPrimaryAction={
						humanQaApproval
							? () => onApprovalAction(humanQaApproval.id, "approved")
							: undefined
					}
					onSecondaryAction={
						humanQaApproval
							? () => onApprovalAction(humanQaApproval.id, "rejected")
							: undefined
					}
				/>
			) : null}

			<Separator />

			<div className="grid gap-4 xl:grid-cols-2">
				<ArtifactCard
					title="Latest Spec"
					content={specArtifact?.content ?? "아직 생성된 spec이 없습니다."}
				/>
				<ArtifactCard
					title="Latest Plan"
					content={planArtifact?.content ?? "아직 생성된 plan이 없습니다."}
				/>
			</div>

			{humanQaNotesArtifact ? (
				<>
					<Separator />
					<ArtifactCard
						title="Human QA Notes"
						content={humanQaNotesArtifact.content}
					/>
				</>
			) : null}

			<Separator />

			<div className="space-y-2">
				<h2 className="text-sm font-medium">원본 요청</h2>
				<div className="rounded-xl bg-muted/30 p-4 text-sm whitespace-pre-wrap">
					{request.rawPrompt}
				</div>
				{request.rulesetReference ? (
					<p className="text-xs text-muted-foreground">
						Rules: {request.rulesetReference}
					</p>
				) : null}
			</div>

			<Separator />

			<div className="space-y-3">
				<h2 className="text-sm font-medium">승인</h2>
				{otherPendingApprovals.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						현재 대기 중인 승인 요청이 없습니다.
					</p>
				) : (
					otherPendingApprovals.map((approval) => (
						<FeatureStudioApprovalPanel
							key={approval.id}
							mode={mapApprovalMode(approval.approvalType)}
							title={formatApprovalTitle(approval.approvalType)}
							description={approval.decisionNotes ?? undefined}
							onApprove={(input) =>
								onApprovalAction(approval.id, "approved", input.feedback)
							}
							onReject={(input) =>
								onApprovalAction(approval.id, "rejected", input.feedback)
							}
							onDiscard={(input) =>
								onApprovalAction(approval.id, "discarded", input.feedback)
							}
						/>
					))
				)}
			</div>

			<Separator />

			<div className="space-y-3">
				<h2 className="text-sm font-medium">대화 기록</h2>
				{request.messages && request.messages.length > 0 ? (
					<div className="space-y-3">
						{request.messages.map((message) => (
							<div
								key={message.id}
								className="rounded-xl border border-border bg-background p-4"
							>
								<p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
									{message.role}
								</p>
								<p className="text-sm whitespace-pre-wrap">{message.content}</p>
							</div>
						))}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">
						저장된 대화가 없습니다.
					</p>
				)}
			</div>
		</div>
	);
}

function ArtifactCard({
	title,
	content,
}: {
	title: string;
	content: string;
}) {
	return (
		<div className="space-y-2">
			<h2 className="text-sm font-medium">{title}</h2>
			<div className="max-h-96 overflow-auto rounded-xl border border-border bg-background p-4 text-sm whitespace-pre-wrap">
				{content}
			</div>
		</div>
	);
}

function getLatestArtifact(
	artifacts: FeatureStudioRequestDetailProps["request"]["artifacts"] | undefined,
	kind: ArtifactKind,
) {
	return artifacts?.find((artifact) => artifact.kind === kind) ?? null;
}

function parseAgentQaReport(content?: string): AgentQaReport | null {
	if (!content) {
		return null;
	}

	try {
		return JSON.parse(content) as AgentQaReport;
	} catch {
		return null;
	}
}

function mapApprovalMode(approvalType: string): "spec_plan" | "human_qa" | "registration" {
	if (approvalType === "human_qa") {
		return "human_qa";
	}
	if (approvalType === "registration") {
		return "registration";
	}
	return "spec_plan";
}

function formatApprovalTitle(approvalType: string) {
	switch (approvalType) {
		case "human_qa":
			return "Human QA Review";
		case "registration":
			return "Registration Approval";
		default:
			return "Spec / Plan Approval";
	}
}
