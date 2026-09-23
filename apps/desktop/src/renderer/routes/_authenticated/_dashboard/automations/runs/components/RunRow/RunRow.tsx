import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { useFormat } from "@superset/i18n/react";
import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { TableCell, TableRow } from "@superset/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { LuChevronRight, LuExternalLink } from "react-icons/lu";
import { TRIGGER_PROVIDERS } from "renderer/routes/_authenticated/_dashboard/automations/components/providers";
import { providerLabelText } from "renderer/routes/_authenticated/_dashboard/automations/components/TriggersEditor/triggerMenu";
import { RUN_STATUS_META } from "renderer/routes/_authenticated/_dashboard/automations/utils/runStatus";
import { RunPayloadPanel } from "../RunPayloadPanel";

export type OrgRun = RouterOutputs["automation"]["listOrgRuns"]["runs"][number];

const PROVIDER_BY_KIND = new Map(
	TRIGGER_PROVIDERS.map((provider) => [provider.kind, provider]),
);

interface RunRowProps {
	run: OrgRun;
	selected: boolean;
	onSelectedChange: (selected: boolean) => void;
	expanded: boolean;
	onExpandedChange: (expanded: boolean) => void;
	columnCount: number;
}

export function RunRow({
	run,
	selected,
	onSelectedChange,
	expanded,
	onExpandedChange,
	columnCount,
}: RunRowProps) {
	const { t } = useLingui();
	const { formatDateTime } = useFormat();
	const navigate = useNavigate();

	const meta = RUN_STATUS_META[run.status];
	const provider = run.triggerKind
		? PROVIDER_BY_KIND.get(run.triggerKind)
		: undefined;
	const openWorkspace = () => {
		if (!run.v2WorkspaceId) return;
		localStorage.setItem("lastViewedWorkspaceId", run.v2WorkspaceId);
		navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: run.v2WorkspaceId },
			search: { terminalId: run.terminalSessionId ?? undefined },
		});
	};

	return (
		<>
			<TableRow className="group/row h-10 border-border/50 text-sm">
				<TableCell className="pl-4">
					<Checkbox
						checked={selected}
						onCheckedChange={(next) => onSelectedChange(next === true)}
						disabled={!run.canRetry}
						aria-label={t({ message: "Select run" })}
					/>
				</TableCell>

				<TableCell>
					<button
						type="button"
						onClick={() =>
							navigate({
								to: "/automations/$automationId",
								params: { automationId: run.automationId },
							})
						}
						className="min-w-0 truncate text-left font-medium hover:underline"
						title={run.automationName}
					>
						{run.automationName}
					</button>
				</TableCell>

				<TableCell className="text-muted-foreground text-xs">
					{provider ? (
						<span className="flex items-center gap-1.5">
							<provider.icon className="size-3.5 shrink-0" />
							<span className="truncate">
								{providerLabelText(provider.label)}
							</span>
						</span>
					) : (
						"—"
					)}
				</TableCell>

				<TableCell className="text-muted-foreground text-xs tabular-nums">
					{formatDateTime(new Date(run.createdAt))}
				</TableCell>

				<TableCell>
					<span className="flex items-center gap-1.5 text-xs">
						<span className={cn("size-1.5 rounded-full", meta.dot)} />
						<span>{i18n._(meta.label)}</span>
					</span>
					{run.error && (
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="line-clamp-1 text-[11px] text-muted-foreground">
									{run.error}
								</span>
							</TooltipTrigger>
							<TooltipContent className="max-w-sm">{run.error}</TooltipContent>
						</Tooltip>
					)}
				</TableCell>

				<TableCell className="pr-4">
					<span className="flex items-center justify-end gap-1">
						{run.v2WorkspaceId && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										onClick={openWorkspace}
										aria-label={t({ message: "Open this run's workspace" })}
									>
										<LuExternalLink className="size-3.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									<Trans>Open this run's workspace</Trans>
								</TooltipContent>
							</Tooltip>
						)}
						{run.hasPayload && (
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								onClick={() => onExpandedChange(!expanded)}
								aria-expanded={expanded}
								aria-label={t({ message: "Show the triggering payload" })}
							>
								<LuChevronRight
									className={cn(
										"size-3.5 transition-transform",
										expanded && "rotate-90",
									)}
								/>
							</Button>
						)}
					</span>
				</TableCell>
			</TableRow>

			{expanded && (
				<TableRow className="border-border/50 hover:bg-transparent">
					<TableCell colSpan={columnCount} className="bg-accent/10 px-4 py-3">
						<RunPayloadPanel runId={run.id} />
					</TableCell>
				</TableRow>
			)}
		</>
	);
}
