import { Alert, AlertDescription, AlertTitle } from "@superset/ui/alert";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { HiExclamationTriangle } from "react-icons/hi2";
import {
	getWorkspaceAutoRenameWarningContent,
	type WorkspaceAutoRenameWarningReason,
} from "shared/workspace-auto-rename-warning";

interface WorkspaceAutoRenameWarningNoticeProps {
	reason: WorkspaceAutoRenameWarningReason;
	onOpenApiKeys?: () => void;
	className?: string;
}

export function WorkspaceAutoRenameWarningNotice({
	reason,
	onOpenApiKeys,
	className,
}: WorkspaceAutoRenameWarningNoticeProps) {
	const content = getWorkspaceAutoRenameWarningContent(reason);

	return (
		<Alert
			className={cn(
				"border-amber-500/25 bg-amber-500/6 text-amber-950 dark:text-amber-50",
				className,
			)}
		>
			<HiExclamationTriangle className="text-amber-600 dark:text-amber-400" />
			<AlertTitle className="text-amber-900 dark:text-amber-100">
				{content.title}
			</AlertTitle>
			<AlertDescription className="gap-3 text-amber-900/80 dark:text-amber-100/80">
				<p>{content.description}</p>
				<div className="flex flex-wrap gap-2">
					{onOpenApiKeys && content.primaryActionLabel ? (
						<Button size="sm" variant="outline" onClick={onOpenApiKeys}>
							{content.primaryActionLabel}
						</Button>
					) : null}
				</div>
				<ul className="list-disc space-y-1 pl-4">
					{content.suggestedActions.map((action) => (
						<li key={action}>{action}</li>
					))}
				</ul>
			</AlertDescription>
		</Alert>
	);
}
