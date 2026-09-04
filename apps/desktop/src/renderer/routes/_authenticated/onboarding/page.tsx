import { SUPPORTED_LOCALES } from "@superset/i18n";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { HiArrowUpRight } from "react-icons/hi2";
import { SiGithub } from "react-icons/si";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { GhAuthDialog, type GhAuthDialogMode } from "./components/GhAuthDialog";
import { OnboardingLanguageRow } from "./components/OnboardingLanguageRow";

export const Route = createFileRoute("/_authenticated/onboarding/")({
	component: OnboardingDashboardPage,
});

const PREREQ_POLL_MS = 4000;

function OnboardingDashboardPage() {
	const [ghDialogMode, setGhDialogMode] = useState<GhAuthDialogMode | null>(
		null,
	);

	// Poll while mounted so external changes (installing gh in a browser,
	// signing in from a terminal) are picked up without a focus change.
	const statusPolling = { refetchInterval: PREREQ_POLL_MS } as const;

	const {
		data: ghStatus,
		refetch: refetchGh,
		isPending: isPendingGh,
	} = electronTrpc.system.detectGhCli.useQuery(undefined, statusPolling);
	const { data: brewStatus } = electronTrpc.system.detectBrew.useQuery();

	const ghInstalled = ghStatus?.installed === true;
	const ghReady = ghInstalled && ghStatus?.authenticated === true;

	const ghStatusLabel = ghReady
		? ghStatus?.version
			? `Connected · v${ghStatus.version}`
			: "Connected"
		: ghInstalled
			? "Not signed in"
			: "Not installed";

	const brewAvailable = brewStatus?.installed === true;

	const openGitHubInstall = () => {
		if (brewAvailable) {
			setGhDialogMode("install");
			return;
		}
		window.open("https://cli.github.com/", "_blank", "noopener,noreferrer");
	};

	return (
		<>
			<div className="-mt-4">
				<p className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
					<span className="relative flex size-1.5">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
						<span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
					</span>
					Detecting automatically · statuses update as you install or sign in
				</p>
				<div className="divide-y divide-border">
					{SUPPORTED_LOCALES.length > 1 && <OnboardingLanguageRow />}
					<OnboardingRow
						icon={<SiGithub className="size-4.5" />}
						chipClassName="bg-foreground text-background"
						name="GitHub CLI"
						description="Clone, push, and create PRs."
						status={rowStatus(isPendingGh, ghReady)}
						statusLabel={ghStatusLabel}
						statusTone={ghInstalled ? "warning" : "neutral"}
						required
						actionLabel={ghInstalled ? "Sign in" : "Install"}
						actionIcon={
							ghInstalled || brewAvailable ? undefined : (
								<HiArrowUpRight className="size-3.5" />
							)
						}
						onAction={
							ghInstalled ? () => setGhDialogMode("auth") : openGitHubInstall
						}
					/>
				</div>
			</div>

			<GhAuthDialog
				open={ghDialogMode !== null}
				mode={ghDialogMode ?? "auth"}
				onOpenChange={(open) => {
					if (!open) setGhDialogMode(null);
				}}
				onExit={() => void refetchGh()}
			/>
		</>
	);
}

type RowStatus = "loading" | "connected" | "disconnected";

// Loading only covers the initial fetch — polling refetches must not flash
// the whole row back to "Checking…" every interval.
function rowStatus(isPending: boolean, connected: boolean): RowStatus {
	if (isPending) return "loading";
	return connected ? "connected" : "disconnected";
}

type StatusTone = "warning" | "neutral";

const STATUS_DOT: Record<"connected" | StatusTone, string> = {
	connected: "bg-emerald-500",
	warning: "bg-amber-500",
	neutral: "bg-muted-foreground/40",
};

interface OnboardingRowProps {
	icon: ReactNode;
	chipClassName?: string;
	name: string;
	description: string;
	status: RowStatus;
	statusLabel?: string;
	statusTone?: StatusTone;
	required?: boolean;
	actionLabel: string;
	actionIcon?: ReactNode;
	onAction: () => void;
}

function OnboardingRow({
	icon,
	chipClassName,
	name,
	description,
	status,
	statusLabel,
	statusTone = "neutral",
	required,
	actionLabel,
	actionIcon,
	onAction,
}: OnboardingRowProps) {
	return (
		<div className="flex items-center gap-4 py-7 first:pt-0 last:pb-0">
			<div
				className={cn(
					"flex size-9 shrink-0 items-center justify-center rounded-md",
					chipClassName ?? "bg-muted text-foreground",
				)}
			>
				{icon}
			</div>
			<div className="min-w-0 flex-1">
				<p className="flex items-center gap-2 text-sm font-medium text-foreground">
					{name}
					{required && (
						<Badge variant="outline" className="px-1.5 py-0 text-[10px]">
							Required
						</Badge>
					)}
				</p>
				<p className="text-xs text-muted-foreground">{description}</p>
			</div>
			<div className="flex shrink-0 items-center gap-3">
				{status === "loading" ? (
					<span className="flex min-w-28 items-center justify-end gap-1.5 text-xs text-muted-foreground">
						<Spinner className="size-3" />
						Checking…
					</span>
				) : (
					statusLabel && (
						<span
							className={cn(
								"flex min-w-28 items-center justify-end gap-1.5 text-xs tabular-nums",
								status === "connected"
									? "text-emerald-500"
									: "text-muted-foreground",
							)}
						>
							<span
								className={cn(
									"size-1.5 rounded-full",
									STATUS_DOT[status === "connected" ? "connected" : statusTone],
								)}
							/>
							{statusLabel}
						</span>
					)
				)}
				{status === "disconnected" && (
					<Button type="button" size="sm" onClick={onAction}>
						{actionLabel}
						{actionIcon}
					</Button>
				)}
			</div>
		</div>
	);
}
