import type { ToolApprovalRequest } from "../../types";

interface ToolApprovalBarProps {
	pendingApproval: ToolApprovalRequest;
	onApprove: () => void;
	onDecline: () => void;
	onAlwaysAllow: () => void;
}

export function ToolApprovalBar({
	pendingApproval,
	onApprove,
	onDecline,
	onAlwaysAllow,
}: ToolApprovalBarProps) {
	return (
		<div className="border-t border-amber-500/30 bg-amber-500/10 px-4 py-3">
			<div className="mx-auto w-full max-w-3xl space-y-2">
				<div className="flex items-center gap-3">
					<div className="flex-1">
						<p className="text-sm font-medium text-amber-600 dark:text-amber-400">
							Tool approval required
						</p>
						<p className="text-xs text-muted-foreground">
							<span className="font-mono">
								{pendingApproval.toolName.replace("mastra_workspace_", "")}
							</span>
							{" wants to execute"}
						</p>
					</div>
					<button
						type="button"
						onClick={onDecline}
						className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
					>
						Decline
					</button>
					<button
						type="button"
						onClick={onAlwaysAllow}
						className="rounded-md border border-amber-600/30 bg-amber-600/10 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-600/20 dark:text-amber-400"
					>
						Always Allow
					</button>
					<button
						type="button"
						onClick={onApprove}
						className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
					>
						Approve
					</button>
				</div>
				{pendingApproval.args != null && (
					<pre className="max-h-32 overflow-auto rounded-md bg-background/60 p-2 font-mono text-[11px] text-muted-foreground">
						{typeof pendingApproval.args === "string"
							? pendingApproval.args
							: (JSON.stringify(pendingApproval.args, null, 2) as string)}
					</pre>
				)}
			</div>
		</div>
	);
}
