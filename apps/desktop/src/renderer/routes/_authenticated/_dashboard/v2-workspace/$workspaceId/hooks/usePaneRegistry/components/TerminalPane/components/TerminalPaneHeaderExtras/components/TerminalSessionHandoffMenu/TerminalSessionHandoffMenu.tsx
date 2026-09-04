import { Trans, useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { buildTerminalSessionHandoffPrompt } from "@superset/shared/terminal-session-handoff";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Label } from "@superset/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { workspaceTrpc } from "@superset/workspace-client";
import { Bot, GitFork, PanelRight, SquareStack } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AgentSelect } from "renderer/components/AgentSelect";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { AGENT_STORAGE_KEY } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup/types";
import { resolveDefaultTargetConfigId } from "./resolveDefaultTargetConfigId";

type Placement = "split-pane" | "new-tab";

/** Rough enough to size a decision: agents bill by token, not character. */
const CHARS_PER_TOKEN = 3.5;

function estimateTokens(characters: number): number {
	return Math.round(characters / CHARS_PER_TOKEN);
}

type SessionAction = "handoff" | "fork";

interface TerminalSessionHandoffMenuProps {
	workspaceId: string;
	terminalId: string;
	onCreateNewAgentSession: (input: {
		configId: string;
		placement: Placement;
		prompt: string;
		forkSessionId?: string;
	}) => Promise<{ terminalId: string } | null>;
}

export function TerminalSessionHandoffMenu({
	workspaceId,
	terminalId,
	onCreateNewAgentSession,
}: TerminalSessionHandoffMenuProps) {
	const { t } = useLingui();
	const binding = useTerminalAgentBinding(workspaceId, terminalId);
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const { data: configs = [] } = useV2AgentConfigs(hostUrl);
	const trpcUtils = workspaceTrpc.useUtils();
	const [menuOpen, setMenuOpen] = useState(false);
	const [action, setAction] = useState<SessionAction | null>(null);
	const [targetConfigId, setTargetConfigId] = useState("");
	const [placement, setPlacement] = useState<Placement>("split-pane");
	const [isStarting, setIsStarting] = useState(false);
	const [transcript, setTranscript] = useState<string | null>(null);
	const [transcriptFailed, setTranscriptFailed] = useState(false);

	const sourceConfig = useMemo(() => {
		const sourceId = binding?.definitionId ?? binding?.agentId;
		if (!sourceId) return undefined;
		return configs.find(
			(config) => config.id === sourceId || config.presetId === sourceId,
		);
	}, [binding?.agentId, binding?.definitionId, configs]);
	const selectedConfig = configs.find((config) => config.id === targetConfigId);
	// `forkArgs` is absent when the host service predates it, so an older
	// remote host degrades to "cannot fork" instead of throwing in render.
	const canFork = Boolean(
		binding?.agentSessionId && sourceConfig?.forkArgs?.length,
	);
	const defaultTargetConfigId = resolveDefaultTargetConfigId(
		configs.map((config) => config.id),
		typeof window === "undefined"
			? null
			: window.localStorage.getItem(AGENT_STORAGE_KEY),
		sourceConfig?.id,
	);

	// Fetched when the dialog opens rather than on Continue, so the size of
	// what is about to be sent is on screen before the decision.
	useEffect(() => {
		if (action !== "handoff") {
			setTranscript(null);
			setTranscriptFailed(false);
			return;
		}
		let cancelled = false;
		setTranscriptFailed(false);
		trpcUtils.terminal.transcript
			.fetch({ workspaceId, terminalId })
			.then((result) => {
				if (!cancelled) setTranscript(result.text ?? "");
			})
			.catch(() => {
				// Distinct from an empty terminal: reporting "0 characters" and
				// leaving Continue armed would fail only after the click.
				if (!cancelled) setTranscriptFailed(true);
			});
		return () => {
			cancelled = true;
		};
	}, [action, terminalId, trpcUtils, workspaceId]);

	useEffect(() => {
		if (action !== "handoff" || targetConfigId) return;
		if (defaultTargetConfigId) setTargetConfigId(defaultTargetConfigId);
	}, [action, defaultTargetConfigId, targetConfigId]);

	if (!binding) return null;

	const openAction = (nextAction: SessionAction) => {
		setMenuOpen(false);
		setAction(nextAction);
		setPlacement("split-pane");
		if (nextAction === "handoff") {
			setTargetConfigId(defaultTargetConfigId);
		}
	};

	const start = async () => {
		if (!action) return;
		setIsStarting(true);
		try {
			if (action === "fork") {
				if (!sourceConfig || !binding.agentSessionId || !canFork) return;
				const result = await onCreateNewAgentSession({
					configId: sourceConfig.id,
					placement,
					prompt: "",
					forkSessionId: binding.agentSessionId,
				});
				if (result) setAction(null);
				return;
			}

			if (!selectedConfig) return;
			// Continue stays disabled without a transcript, and the dialog says
			// why inline; this only guards the impossible.
			if (!transcript) return;
			const result = await onCreateNewAgentSession({
				configId: selectedConfig.id,
				placement,
				prompt: buildTerminalSessionHandoffPrompt({
					transcript,
					sourceAgentLabel: sourceConfig?.label ?? binding.agentId,
					sourceTerminalId: terminalId,
				}),
			});
			if (result) setAction(null);
		} finally {
			setIsStarting(false);
		}
	};

	const title =
		action === "fork" ? (
			<Trans>Fork session</Trans>
		) : (
			<Trans>Continue with another agent</Trans>
		);

	return (
		<>
			<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label={t({
									message: "Continue or fork session",
								})}
								className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
							>
								<GitFork className="size-3.5" />
							</button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans>Continue or fork session</Trans>
					</TooltipContent>
				</Tooltip>
				<DropdownMenuContent align="end" className="w-64">
					<DropdownMenuItem onSelect={() => openAction("handoff")}>
						<Bot />
						<Trans>Continue with another agent…</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={!canFork}
						onSelect={() => openAction("fork")}
					>
						<GitFork />
						<Trans>Fork session…</Trans>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog
				open={action !== null}
				onOpenChange={(open) => {
					if (!open && !isStarting) setAction(null);
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription>
							{action === "fork" ? (
								<Trans>
									Create a native provider fork with the same conversation
									context. The original session stays unchanged.
								</Trans>
							) : (
								<Trans>
									Start a fresh agent session seeded with this terminal's recent
									context. Workspace files remain the source of truth.
								</Trans>
							)}
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-4 py-1">
						{action === "handoff" ? (
							<div className="flex flex-col gap-2">
								<Label>
									<Trans>Target agent</Trans>
								</Label>
								<AgentSelect
									agents={configs.map((config) => ({
										id: config.id,
										label: config.label,
										iconId: config.presetId,
										presetId: config.presetId,
									}))}
									value={targetConfigId}
									placeholder={t({
										message: "Select an agent",
									})}
									onValueChange={setTargetConfigId}
									disabled={isStarting || configs.length === 0}
									triggerClassName="w-full"
									onBeforeConfigureAgents={() => setAction(null)}
								/>
								{selectedConfig && (
									<p className="text-muted-foreground text-xs">
										{transcriptFailed ? (
											<Trans>Couldn't read this terminal's context.</Trans>
										) : transcript === null ? (
											<Trans>
												Measuring the context to send to {selectedConfig.label}…
											</Trans>
										) : transcript.length === 0 ? (
											<Trans>
												This terminal has no output to hand over yet.
											</Trans>
										) : (
											<Trans>
												Sends {formatNumber(transcript.length)} characters of
												terminal context (about{" "}
												{formatNumber(estimateTokens(transcript.length))}{" "}
												tokens) to {selectedConfig.label}.
											</Trans>
										)}
									</p>
								)}
							</div>
						) : (
							<div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
								<Trans>
									Provider: {sourceConfig?.label ?? binding.agentId}
								</Trans>
							</div>
						)}

						<div className="flex flex-col gap-2">
							<Label>
								<Trans>Open session in</Trans>
							</Label>
							<div className="grid grid-cols-2 gap-2" role="radiogroup">
								<Button
									type="button"
									variant={placement === "split-pane" ? "secondary" : "outline"}
									onClick={() => setPlacement("split-pane")}
									aria-pressed={placement === "split-pane"}
									disabled={isStarting}
								>
									<PanelRight />
									<Trans>Split pane</Trans>
								</Button>
								<Button
									type="button"
									variant={placement === "new-tab" ? "secondary" : "outline"}
									onClick={() => setPlacement("new-tab")}
									aria-pressed={placement === "new-tab"}
									disabled={isStarting}
								>
									<SquareStack />
									<Trans>New tab</Trans>
								</Button>
							</div>
						</div>
					</div>

					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => setAction(null)}
							disabled={isStarting}
						>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							onClick={start}
							disabled={
								isStarting ||
								(action === "fork"
									? !canFork
									: // Nothing to hand over, or the read failed: refuse before
										// the click rather than after it.
										!selectedConfig || !transcript)
							}
						>
							{isStarting ? (
								<Trans>Starting…</Trans>
							) : action === "fork" ? (
								<Trans>Fork session</Trans>
							) : (
								<Trans>Continue</Trans>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
