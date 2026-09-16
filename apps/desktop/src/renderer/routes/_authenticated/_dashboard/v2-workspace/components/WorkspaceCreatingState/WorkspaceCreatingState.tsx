import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { Check, GitBranch, Loader2, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";

interface WorkspaceCreatingStateProps {
	name?: string;
	branch?: string;
	startedAt?: number;
	isSession?: boolean;
	workspaceReady: boolean;
}

export function WorkspaceCreatingState({
	name,
	branch,
	startedAt,
	isSession = false,
	workspaceReady,
}: WorkspaceCreatingStateProps) {
	const { t } = useLingui();
	const { formatNumber } = useFormat();
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), 250);
		return () => window.clearInterval(id);
	}, []);
	const elapsed = startedAt
		? Math.max(0, Math.floor((now - startedAt) / 1000))
		: 0;
	const stuck = elapsed >= 30;
	const steps = [
		{
			label: t({ message: "Preparing" }),
			done: workspaceReady,
			active: !workspaceReady,
		},
		{ label: t({ message: "Starting" }), done: false, active: workspaceReady },
	];

	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-sm flex-col items-start gap-5">
				<Loader2
					className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none"
					strokeWidth={1.5}
					aria-hidden="true"
				/>

				<div className="flex flex-col gap-1.5">
					<h1 className="text-[15px] font-medium tracking-tight text-foreground">
						{isSession
							? t({
									message: "Creating session",
								})
							: t({
									message: "Creating workspace",
								})}
					</h1>
					<p className="truncate text-[13px] leading-relaxed text-muted-foreground">
						{name ||
							t({
								message: "Untitled workspace",
							})}
					</p>
				</div>

				{branch && (
					<div className="flex w-full items-center gap-2">
						<GitBranch
							className="size-3 shrink-0 text-muted-foreground/80"
							strokeWidth={2}
							aria-hidden="true"
						/>
						<code className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
							{branch}
						</code>
					</div>
				)}

				<ul className="flex w-full flex-col gap-2" aria-live="polite">
					{steps.map((step) => (
						<li
							key={step.label}
							aria-current={step.active ? "step" : undefined}
							className={cn(
								"flex items-center gap-2.5 text-[13px] leading-tight",
								step.active || step.done
									? "text-foreground/80"
									: "text-muted-foreground/55",
							)}
						>
							{step.done ? (
								<Check className="size-3.5" aria-hidden="true" />
							) : step.active ? (
								<Loader2
									className="size-3.5 animate-spin motion-reduce:animate-none"
									aria-hidden="true"
								/>
							) : (
								<span className="size-3.5" aria-hidden="true" />
							)}
							<span>{step.label}</span>
						</li>
					))}
				</ul>
				<span className="font-mono text-[11px] tabular-nums text-muted-foreground/80">
					{formatNumber(Math.floor(elapsed / 60), { useGrouping: false })}:
					{formatNumber(elapsed % 60, {
						minimumIntegerDigits: 2,
						useGrouping: false,
					})}
				</span>

				{stuck && (
					<div className="flex w-full flex-col gap-2 border-t border-border/60 pt-4 animate-in fade-in slide-in-from-bottom-1 duration-500">
						<p className="select-text cursor-text text-[12px] leading-relaxed text-muted-foreground">
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
							className="h-7 w-fit gap-1.5 px-2 text-[12px] font-medium"
							onClick={() => window.location.reload()}
						>
							<RotateCw
								className="size-3.5"
								strokeWidth={2}
								aria-hidden="true"
							/>
							<Trans>Reload window</Trans>
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
