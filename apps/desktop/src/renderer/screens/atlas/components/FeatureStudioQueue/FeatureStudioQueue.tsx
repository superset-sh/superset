import { Link } from "@tanstack/react-router";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";

export interface FeatureStudioQueueData {
	requests: Array<{
		id: string;
		title: string;
		status: string;
		summary: string | null;
		createdAt: string | Date;
	}>;
	pendingApprovals: Array<{
		id: string;
		featureRequestId: string;
		approvalType: string;
		status: string;
	}>;
}

interface FeatureStudioQueueProps {
	queue: FeatureStudioQueueData;
	readyToRegisterCount: number;
	onAdvance: (featureRequestId: string) => void;
}

export function FeatureStudioQueue({
	queue,
	readyToRegisterCount,
	onAdvance,
}: FeatureStudioQueueProps) {
	if (queue.requests.length === 0) {
		return (
			<div className="rounded-xl border border-dashed border-border p-8 text-center">
				<p className="text-sm text-muted-foreground">
					아직 생성된 feature request가 없습니다.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="grid gap-3 md:grid-cols-3">
				<SummaryCard label="전체 요청" value={queue.requests.length} />
				<SummaryCard
					label="승인 대기"
					value={queue.pendingApprovals.length}
				/>
				<SummaryCard label="등록 대기" value={readyToRegisterCount} />
			</div>

			<div className="space-y-3">
				{queue.requests.map((request) => {
					const pendingCount = queue.pendingApprovals.filter(
						(approval) => approval.featureRequestId === request.id,
					).length;

					return (
						<div
							key={request.id}
							className="rounded-xl border border-border bg-background p-4"
						>
							<div className="flex items-start justify-between gap-4">
								<div className="space-y-2">
									<div className="flex items-center gap-2">
										<Link
											to="/atlas/studio/$requestId"
											params={{ requestId: request.id }}
											className="text-sm font-medium text-foreground hover:underline"
										>
											{request.title}
										</Link>
										<Badge variant="outline">
											{formatStatus(request.status)}
										</Badge>
										{pendingCount > 0 ? (
											<Badge variant="secondary">
												승인 {pendingCount}건
											</Badge>
										) : null}
									</div>
									<p className="text-sm text-muted-foreground">
										{request.summary ?? "요약이 아직 없습니다."}
									</p>
								</div>

								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => onAdvance(request.id)}
									>
										진행
									</Button>
									<Button asChild size="sm">
										<Link
											to="/atlas/studio/$requestId"
											params={{ requestId: request.id }}
										>
											상세 보기
										</Link>
									</Button>
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function SummaryCard({
	label,
	value,
}: {
	label: string;
	value: number;
}) {
	return (
		<div className="rounded-xl border border-border bg-muted/30 p-4">
			<p className="text-xs text-muted-foreground">{label}</p>
			<p className="mt-2 text-2xl font-semibold">{value}</p>
		</div>
	);
}

function formatStatus(status: string) {
	return status.replaceAll("_", " ");
}
