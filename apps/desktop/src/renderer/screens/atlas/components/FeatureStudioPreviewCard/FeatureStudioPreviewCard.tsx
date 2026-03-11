import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";

interface FeatureStudioPreviewCardProps {
	previewUrl: string;
	branchName?: string | null;
	previewStatus?: string | null;
	commitSha?: string | null;
	agentQaSummary?: string | null;
	agentQaChecks?: Array<{
		label: string;
		status: "passed" | "failed";
		note?: string;
	}>;
	primaryActionLabel?: string;
	secondaryActionLabel?: string;
	onPrimaryAction?: () => void;
	onSecondaryAction?: () => void;
}

export function FeatureStudioPreviewCard({
	previewUrl,
	branchName,
	previewStatus,
	commitSha,
	agentQaSummary,
	agentQaChecks,
	primaryActionLabel,
	secondaryActionLabel,
	onPrimaryAction,
	onSecondaryAction,
}: FeatureStudioPreviewCardProps) {
	return (
		<div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<p className="text-sm font-medium">Vercel Preview</p>
						{previewStatus ? (
							<Badge variant="outline">{previewStatus}</Badge>
						) : null}
					</div>
					<p className="text-xs text-muted-foreground break-all">{previewUrl}</p>
					<div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
						{branchName ? <span>Branch: {branchName}</span> : null}
						{commitSha ? <span>Commit: {commitSha.slice(0, 12)}</span> : null}
					</div>
				</div>
				<Button asChild size="sm">
					<a href={previewUrl} target="_blank" rel="noreferrer">
						프리뷰 열기
					</a>
				</Button>
			</div>

			{agentQaSummary ? (
				<div className="space-y-2">
					<p className="text-sm font-medium">Agent QA</p>
					<p className="text-sm text-muted-foreground">{agentQaSummary}</p>
					{agentQaChecks?.length ? (
						<div className="space-y-2">
							{agentQaChecks.map((check) => (
								<div
									key={`${check.label}-${check.status}`}
									className="rounded-lg border border-border bg-background px-3 py-2"
								>
									<div className="flex items-center justify-between gap-3">
										<p className="text-sm">{check.label}</p>
										<Badge
											variant={
												check.status === "passed" ? "secondary" : "destructive"
											}
										>
											{check.status}
										</Badge>
									</div>
									{check.note ? (
										<p className="mt-1 text-xs text-muted-foreground">
											{check.note}
										</p>
									) : null}
								</div>
							))}
						</div>
					) : null}
				</div>
			) : null}

			{primaryActionLabel || secondaryActionLabel ? (
				<div className="flex flex-wrap items-center justify-end gap-2">
					{secondaryActionLabel && onSecondaryAction ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onSecondaryAction}
						>
							{secondaryActionLabel}
						</Button>
					) : null}
					{primaryActionLabel && onPrimaryAction ? (
						<Button type="button" size="sm" onClick={onPrimaryAction}>
							{primaryActionLabel}
						</Button>
					) : null}
				</div>
			) : null}
		</div>
	);
}
