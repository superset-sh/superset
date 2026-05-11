import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { AlertTriangle, Clipboard, RotateCw } from "lucide-react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface WorkspaceLocalHostStoppedStateProps {
	organizationId: string;
	lastError: string | null;
	lastAttemptAt: number | null;
	retryAttempt: number;
}

const MANIFEST_PATH_HINT = "~/.superset/host/<orgId>/";

export function WorkspaceLocalHostStoppedState({
	organizationId,
	lastError,
	lastAttemptAt,
	retryAttempt,
}: WorkspaceLocalHostStoppedStateProps) {
	const { copyToClipboard } = useCopyToClipboard();
	const resetMutation = electronTrpc.hostServiceCoordinator.reset.useMutation({
		onError: (error) => {
			toast.error("Reset failed", { description: error.message });
		},
	});

	const onReset = () => {
		resetMutation.mutate({ organizationId, wipeHostDb: false });
	};

	const onCopyDiagnostics = () => {
		const lines = [
			"Superset host-service diagnostics",
			`organizationId: ${organizationId}`,
			`manifestDir: ${MANIFEST_PATH_HINT.replace("<orgId>", organizationId)}`,
			`retryAttempt: ${retryAttempt}`,
			`lastAttemptAt: ${
				lastAttemptAt ? new Date(lastAttemptAt).toISOString() : "—"
			}`,
			`lastError: ${lastError ?? "(none — host-service status reported stopped)"}`,
			`reporter: superset-sh/superset#4299`,
		];
		void copyToClipboard(lines.join("\n"));
		toast.success("Diagnostics copied to clipboard");
	};

	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-md flex-col items-start gap-6">
				<div className="grid size-10 place-items-center rounded-lg border border-border/60 bg-muted/30">
					<AlertTriangle
						className="size-[18px] text-muted-foreground"
						strokeWidth={1.5}
						aria-hidden="true"
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<h1 className="text-[15px] font-medium tracking-tight text-foreground">
						Host service stopped
					</h1>
					<p className="select-text cursor-text text-[13px] leading-relaxed text-muted-foreground">
						The local host service didn't come back up after automatic retries.
						Reset it to try again, or copy diagnostics for support.
					</p>
				</div>

				{lastError ? (
					<div className="flex w-full flex-col gap-1.5 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
						<span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
							Last error
						</span>
						<span className="select-text cursor-text break-words text-[12px] leading-relaxed text-foreground">
							{lastError}
						</span>
					</div>
				) : null}

				<div className="flex w-full flex-wrap gap-2">
					<Button
						size="sm"
						onClick={onReset}
						disabled={resetMutation.isPending}
						className="gap-1.5"
					>
						<RotateCw className="size-3.5" strokeWidth={2} aria-hidden="true" />
						{resetMutation.isPending ? "Resetting…" : "Reset host service"}
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={onCopyDiagnostics}
						className="gap-1.5"
					>
						<Clipboard
							className="size-3.5"
							strokeWidth={2}
							aria-hidden="true"
						/>
						Copy diagnostics
					</Button>
				</div>
			</div>
		</div>
	);
}
