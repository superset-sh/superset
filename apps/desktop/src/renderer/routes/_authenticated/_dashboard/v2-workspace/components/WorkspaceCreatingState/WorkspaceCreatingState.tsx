import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { GitBranch, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface WorkspaceCreatingStateProps {
	name?: string;
	branch?: string;
	startedAt?: number;
	isSession?: boolean;
}

/** Creation has no phase stream. Show activity, then hand off to persisted setup status. */
export function WorkspaceCreatingState({
	name,
	branch,
	startedAt,
	isSession = false,
}: WorkspaceCreatingStateProps) {
	const { t } = useLingui();
	const [stuck, setStuck] = useState(false);
	useEffect(() => {
		setStuck(false);
		const timer = setTimeout(
			() => setStuck(true),
			Math.max(0, 30_000 - (Date.now() - (startedAt ?? Date.now()))),
		);
		return () => clearTimeout(timer);
	}, [startedAt]);
	return (
		<div
			className="flex h-full w-full items-center justify-center p-6"
			aria-live="polite"
		>
			<div className="flex w-full max-w-sm flex-col items-start gap-5">
				<Loader2
					className="size-5 animate-spin text-muted-foreground"
					strokeWidth={1.5}
					aria-hidden="true"
				/>
				<div className="space-y-1.5">
					<h1 className="text-[15px] font-medium tracking-tight">
						{isSession ? (
							<Trans>Creating session</Trans>
						) : (
							<Trans>Creating workspace</Trans>
						)}
					</h1>
					<p className="text-[13px] text-muted-foreground">
						{name || t({ message: "Untitled workspace" })}
					</p>
				</div>
				{branch && (
					<div className="flex min-w-0 items-center gap-2 text-muted-foreground">
						<GitBranch className="size-3 shrink-0" aria-hidden="true" />
						<code className="break-all text-xs">{branch}</code>
					</div>
				)}
				{stuck && (
					<div className="space-y-3 border-t border-border pt-4 text-xs text-muted-foreground">
						<p>
							{isSession ? (
								<Trans>
									This is taking longer than usual. The session may already be
									ready — reloading can pick it up.
								</Trans>
							) : (
								<Trans>
									This is taking longer than usual. The workspace may already be
									ready — reloading can pick it up.
								</Trans>
							)}
						</p>
						<Button
							size="sm"
							variant="outline"
							onClick={() => window.location.reload()}
						>
							<Trans>Reload</Trans>
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
