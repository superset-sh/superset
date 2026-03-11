import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Separator } from "@superset/ui/separator";

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
		worktrees?: Array<{
			id: string;
			branchName: string;
			previewUrl: string | null;
			previewStatus: string | null;
		}>;
	};
	onAdvance: () => void;
	onRequestRegistrationApproval: () => void;
	onRegister: () => void;
	onApprovalAction: (
		approvalId: string,
		action: "approved" | "rejected" | "discarded",
	) => void;
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
					<Button variant="outline" size="sm" onClick={onAdvance}>
						진행
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={onRequestRegistrationApproval}
					>
						등록 승인 요청
					</Button>
					<Button size="sm" onClick={onRegister}>
						등록
					</Button>
				</div>
			</div>

			{latestWorktree?.previewUrl ? (
				<div className="rounded-xl border border-border bg-muted/20 p-4">
					<div className="flex items-center justify-between gap-4">
						<div>
							<p className="text-sm font-medium">Vercel Preview</p>
							<p className="text-xs text-muted-foreground">
								{latestWorktree.branchName}
								{latestWorktree.previewStatus
									? ` · ${latestWorktree.previewStatus}`
									: ""}
							</p>
						</div>
						<Button asChild size="sm">
							<a
								href={latestWorktree.previewUrl}
								target="_blank"
								rel="noreferrer"
							>
								프리뷰 열기
							</a>
						</Button>
					</div>
				</div>
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
				{pendingApprovals.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						현재 대기 중인 승인 요청이 없습니다.
					</p>
				) : (
					pendingApprovals.map((approval) => (
						<div
							key={approval.id}
							className="rounded-xl border border-border bg-background p-4"
						>
							<div className="flex items-center justify-between gap-4">
								<div>
									<p className="text-sm font-medium">
										{approval.approvalType.replaceAll("_", " ")}
									</p>
									<p className="text-xs text-muted-foreground">
										상태: {approval.status}
									</p>
								</div>
								<div className="flex gap-2">
									<Button
										size="sm"
										onClick={() => onApprovalAction(approval.id, "approved")}
									>
										승인
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={() => onApprovalAction(approval.id, "rejected")}
									>
										반려
									</Button>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => onApprovalAction(approval.id, "discarded")}
									>
										폐기
									</Button>
								</div>
							</div>
						</div>
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
