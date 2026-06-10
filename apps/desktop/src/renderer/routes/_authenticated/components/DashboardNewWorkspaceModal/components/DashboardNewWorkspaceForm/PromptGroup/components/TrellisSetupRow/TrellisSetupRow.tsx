import { Checkbox } from "@superset/ui/checkbox";
import { cn } from "@superset/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, Workflow } from "lucide-react";
import { useEffect } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

interface TrellisSetupRowProps {
	projectId: string | null;
	hostId: string | null;
	disabled?: boolean;
	allowProjectPreparation?: boolean;
	projectSetupState?: ProjectSetupState;
	initialize: boolean;
	onInitializeChange: (initialize: boolean) => void;
}

export type ProjectSetupState = "ready" | "not-setup" | "checking";

export function getProjectSetupState(
	needsSetup: boolean | null | undefined,
): ProjectSetupState {
	if (needsSetup === true) return "not-setup";
	if (needsSetup === false) return "ready";
	return "checking";
}

function statusCopy(
	state:
		| "ready"
		| "missing"
		| "partial"
		| "unavailable"
		| "project-not-setup"
		| "project-checking"
		| undefined,
) {
	switch (state) {
		case "project-checking":
			return {
				title: "Checking selected device",
				description: "Confirming this project is available there.",
			};
		case "project-not-setup":
			return {
				title: "Prepare project on this device",
				description: "The project will be prepared before the workflow starts.",
			};
		case "ready":
			return {
				title: "Guided workflow ready",
				description: "Plan, check, review before coding.",
			};
		case "missing":
			return {
				title: "Use guided workflow",
				description: "Plan, check, review before coding.",
			};
		case "partial":
			return {
				title: "Workflow setup needs attention",
				description:
					"Existing workflow setup was found, so it will not be overwritten.",
			};
		case "unavailable":
			return {
				title: "Workflow check unavailable",
				description: "Update selected device or continue without setup.",
			};
		default:
			return {
				title: "Checking workflow setup",
				description: "Looking for repository workflow files.",
			};
	}
}

export function TrellisSetupRow({
	projectId,
	hostId,
	disabled = false,
	allowProjectPreparation = false,
	projectSetupState,
	initialize,
	onInitializeChange,
}: TrellisSetupRowProps) {
	const hostUrl = useHostUrl(hostId);
	const canCheckWorkflow =
		projectSetupState !== "checking" &&
		(projectSetupState !== "not-setup" || allowProjectPreparation);
	const canPrepareProject =
		allowProjectPreparation && projectSetupState === "not-setup";
	const { data, isFetching, error } = useQuery({
		queryKey: ["workspaceCreation", "trellisStatus", projectId, hostUrl],
		queryFn: async () => {
			if (!projectId || !hostUrl) return null;
			return getHostServiceClientByUrl(
				hostUrl,
			).workspaceCreation.getTrellisStatus.query({ projectId });
		},
		enabled: Boolean(
			projectId &&
				hostUrl &&
				!disabled &&
				canCheckWorkflow &&
				!canPrepareProject,
		),
		retry: false,
		staleTime: 10_000,
	});

	const setupBlockedState =
		projectSetupState === "checking"
			? "project-checking"
			: projectSetupState === "not-setup" && !allowProjectPreparation
				? "project-not-setup"
				: null;
	const state =
		setupBlockedState ??
		(canPrepareProject ? "missing" : error ? "unavailable" : data?.state);
	const copy = statusCopy(state);
	const canInitialize = state === "missing" && !disabled;

	useEffect(() => {
		if (canInitialize || !initialize) return;
		onInitializeChange(false);
	}, [canInitialize, initialize, onInitializeChange]);

	if (!projectId) return null;

	return (
		<div
			className={cn(
				"flex min-w-0 max-w-full items-start gap-2 overflow-hidden rounded-md border border-border/60 bg-background/70 px-2.5 py-2 text-left",
				canInitialize && "hover:bg-muted/40",
				disabled && "opacity-60",
			)}
		>
			{canInitialize ? (
				<Checkbox
					aria-label="Use guided workflow when creating this workspace"
					checked={initialize}
					onCheckedChange={(checked) => onInitializeChange(checked === true)}
					className="mt-0.5 shrink-0"
				/>
			) : (
				<div className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground">
					{isFetching && !data ? (
						<Loader2 className="size-3 animate-spin" />
					) : state === "ready" ? (
						<CheckCircle2 className="size-3 text-emerald-500" />
					) : state === "partial" ||
						state === "unavailable" ||
						state === "project-not-setup" ? (
						<AlertCircle className="size-3 text-amber-500" />
					) : state === "project-checking" ? (
						<Loader2 className="size-3 animate-spin" />
					) : (
						<Workflow className="size-3" />
					)}
				</div>
			)}
			<div className="min-w-0 flex-1">
				<div className="truncate text-xs font-medium text-foreground">
					{copy.title}
				</div>
				<div className="truncate text-[11px] text-muted-foreground">
					{copy.description}
				</div>
			</div>
		</div>
	);
}
