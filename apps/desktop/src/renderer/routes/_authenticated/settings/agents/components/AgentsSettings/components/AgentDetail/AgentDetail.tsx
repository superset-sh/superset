import { Trans, useLingui } from "@lingui/react/macro";
import type { HostAgentConfig } from "@superset/host-service/settings";
import { errorMessage } from "@superset/i18n/errors";
import { AGENT_TYPES } from "@superset/shared/agent-command";
import type { PromptTransport } from "@superset/shared/agent-prompt-launch";
import { getPresetById } from "@superset/shared/host-agent-presets";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useMutation } from "@tanstack/react-query";
import { Info, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
	getAgentCommandText,
	isAgentCommandPatchChanged,
	parseAgentCommandText,
} from "renderer/lib/agent-launch-command";
import { joinArgs, parseArgs } from "renderer/lib/argv";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	AgentDetailHeader,
	AgentLaunchFields,
	Section,
} from "../AgentFormControls";
import { AgentIconPicker } from "../AgentIconPicker";

interface AgentDetailProps {
	config: HostAgentConfig;
	description: string;
	onChanged: (updated: HostAgentConfig) => void;
	onDeleted: () => void;
}

export function AgentDetail({
	config,
	description,
	onChanged,
	onDeleted,
}: AgentDetailProps) {
	const { t } = useLingui();
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const isCustom = config.presetId === "custom";
	const hasBundledDefault = getPresetById(config.presetId) !== undefined;
	const isHooksSetupTarget = (AGENT_TYPES as readonly string[]).includes(
		config.presetId,
	);

	const electronUtils = electronTrpc.useUtils();
	const disabledHooksQuery =
		electronTrpc.settings.getAgentHooksDisabled.useQuery(undefined, {
			enabled: isHooksSetupTarget,
		});
	const hooksEnabled = !disabledHooksQuery.data?.includes(config.presetId);
	const setHooksEnabledMutation =
		electronTrpc.settings.setAgentHooksEnabled.useMutation({
			onSettled: () => {
				void electronUtils.settings.getAgentHooksDisabled.invalidate();
			},
			onError: (err) =>
				toast.error(
					errorMessage(
						err,
						t({
							message: "Failed to update hooks",
						}),
					),
				),
		});

	const [label, setLabel] = useState(config.label);
	const [commandText, setCommandText] = useState(getAgentCommandText(config));
	const [promptArgsText, setPromptArgsText] = useState(
		joinArgs(config.promptArgs),
	);
	const [resumeArgsText, setResumeArgsText] = useState(
		joinArgs(config.resumeArgs),
	);
	const [forkArgsText, setForkArgsText] = useState(
		joinArgs(config.forkArgs ?? []),
	);
	const [promptTransport, setPromptTransport] = useState<PromptTransport>(
		config.promptTransport,
	);

	useEffect(() => {
		setLabel(config.label);
		setCommandText(
			getAgentCommandText({
				command: config.command,
				args: config.args,
				env: config.env,
			}),
		);
		setPromptArgsText(joinArgs(config.promptArgs));
		setResumeArgsText(joinArgs(config.resumeArgs));
		setForkArgsText(joinArgs(config.forkArgs ?? []));
		setPromptTransport(config.promptTransport);
	}, [
		config.label,
		config.command,
		config.args,
		config.env,
		config.promptArgs,
		config.resumeArgs,
		config.forkArgs,
		config.promptTransport,
	]);

	const updateMutation = useMutation({
		mutationFn: (
			patch: Parameters<
				ReturnType<
					typeof getHostServiceClientByUrl
				>["settings"]["agentConfigs"]["update"]["mutate"]
			>[0]["patch"],
		) => {
			if (!activeHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, {
						action: "saveAgent",
					}),
				);
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.update.mutate({ id: config.id, patch });
		},
		onSuccess: (updated) => onChanged(updated),
		onError: (err) =>
			toast.error(
				errorMessage(
					err,
					t({
						message: "Failed to save",
					}),
				),
			),
	});

	const removeMutation = useMutation({
		mutationFn: () => {
			if (!activeHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, {
						action: "removeAgent",
					}),
				);
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.remove.mutate({ id: config.id });
		},
		onSuccess: () => onDeleted(),
		onError: (err) =>
			toast.error(
				errorMessage(
					err,
					t({
						message: "Failed to remove",
					}),
				),
			),
	});

	const restoreDefaultMutation = useMutation({
		mutationFn: () => {
			if (!activeHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, {
						action: "restoreAgentDefaults",
					}),
				);
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.restoreDefault.mutate({ id: config.id });
		},
		onSuccess: (updated) => {
			onChanged(updated);
			const updatedLabel = updated.label;
			toast.success(
				t({
					message: `${updatedLabel} restored to defaults`,
				}),
			);
		},
		onError: (err) =>
			toast.error(
				errorMessage(
					err,
					t({
						message: "Failed to restore defaults",
					}),
				),
			),
	});

	const handleLabelBlur = () => {
		if (label !== config.label && label.trim().length > 0) {
			updateMutation.mutate({ label });
		}
	};

	const handleCommandBlur = () => {
		const patch = parseAgentCommandText(commandText);
		const { command } = patch;
		if (command.length === 0) {
			toast.error(
				t({
					message: "Command cannot be empty",
				}),
			);
			setCommandText(getAgentCommandText(config));
			return;
		}
		if (isAgentCommandPatchChanged(config, patch)) {
			updateMutation.mutate(patch);
		}
	};

	const handlePromptArgsBlur = () => {
		const args = parseArgs(promptArgsText);
		const changed =
			args.length !== config.promptArgs.length ||
			args.some((arg, i) => arg !== config.promptArgs[i]);
		if (changed) updateMutation.mutate({ promptArgs: args });
	};

	const handleResumeArgsBlur = () => {
		const args = parseArgs(resumeArgsText);
		const changed =
			args.length !== config.resumeArgs.length ||
			args.some((arg, i) => arg !== config.resumeArgs[i]);
		if (changed) updateMutation.mutate({ resumeArgs: args });
	};

	const handleForkArgsBlur = () => {
		const args = parseArgs(forkArgsText);
		const changed =
			args.length !== (config.forkArgs ?? []).length ||
			args.some((arg, i) => arg !== (config.forkArgs ?? [])[i]);
		if (changed) updateMutation.mutate({ forkArgs: args });
	};

	const handleTransportChange = (next: PromptTransport) => {
		if (next === promptTransport) return;
		const prev = promptTransport;
		setPromptTransport(next);
		updateMutation.mutate(
			{ promptTransport: next },
			{ onError: () => setPromptTransport(prev) },
		);
	};

	return (
		<div className="p-6 max-w-3xl w-full mx-auto">
			<AgentDetailHeader
				iconId={config.iconId}
				presetId={config.presetId}
				title={config.label}
				subtitle={description}
			/>

			<div className="space-y-6">
				<Section
					title={t({
						message: "Label",
					})}
				>
					<Input
						id={`label-${config.id}`}
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						onBlur={handleLabelBlur}
					/>
				</Section>

				{isCustom ? (
					<Section
						title={t({
							message: "Icon",
						})}
					>
						<AgentIconPicker
							value={config.iconId}
							onChange={(iconId) => updateMutation.mutate({ iconId })}
							disabled={updateMutation.isPending}
						/>
					</Section>
				) : null}

				<AgentLaunchFields
					idPrefix={config.id}
					commandText={commandText}
					onCommandTextChange={setCommandText}
					onCommandBlur={handleCommandBlur}
					promptArgsText={promptArgsText}
					onPromptArgsTextChange={setPromptArgsText}
					onPromptArgsBlur={handlePromptArgsBlur}
					resumeArgsText={resumeArgsText}
					onResumeArgsTextChange={setResumeArgsText}
					onResumeArgsBlur={handleResumeArgsBlur}
					forkArgsText={forkArgsText}
					onForkArgsTextChange={setForkArgsText}
					onForkArgsBlur={handleForkArgsBlur}
					promptTransport={promptTransport}
					onPromptTransportChange={handleTransportChange}
				/>

				{isHooksSetupTarget ? (
					<div className="pt-2">
						<div className="flex items-center justify-between gap-8">
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-1.5">
									<div className="text-sm font-medium">
										<Trans>Superset hooks</Trans>
									</div>
									<Tooltip>
										<TooltipTrigger asChild>
											<Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
										</TooltipTrigger>
										<TooltipContent side="top" className="max-w-[320px]">
											<Trans>
												Registers lifecycle hooks in this agent's global config
												so Superset can show status and send notifications.
												Turning this off removes Superset's entries everywhere —
												status and notifications stop for this agent, including
												inside Superset.
											</Trans>
										</TooltipContent>
									</Tooltip>
								</div>
								<p className="text-sm text-muted-foreground mt-0.5">
									<Trans>
										Show status and send notifications for this agent.
									</Trans>
								</p>
							</div>
							<Switch
								aria-label={t({
									message: "Superset hooks",
								})}
								checked={hooksEnabled}
								onCheckedChange={(enabled) =>
									setHooksEnabledMutation.mutate({
										agentId: config.presetId,
										enabled,
									})
								}
								disabled={
									disabledHooksQuery.isLoading ||
									setHooksEnabledMutation.isPending
								}
								className="shrink-0"
							/>
						</div>
					</div>
				) : null}

				{hasBundledDefault ? (
					<div className="pt-2">
						<div className="flex items-center justify-between gap-8">
							<div className="min-w-0 flex-1">
								<div className="text-sm font-medium">
									<Trans>Restore default</Trans>
								</div>
								<p className="text-sm text-muted-foreground mt-0.5">
									<Trans>
										Replace this agent's launch settings with the current
										bundled configuration.
									</Trans>
								</p>
							</div>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										disabled={restoreDefaultMutation.isPending}
										className="shrink-0 gap-1.5"
									>
										<RotateCcw className="size-3.5" />
										<Trans>Restore</Trans>
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>
											<Trans>Restore {config.label} to defaults?</Trans>
										</AlertDialogTitle>
										<AlertDialogDescription>
											<Trans>
												This replaces its label, command, arguments, prompt and
												resume settings, environment variables, and icon with
												the current bundled configuration.
											</Trans>
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>
											<Trans>Cancel</Trans>
										</AlertDialogCancel>
										<AlertDialogAction
											onClick={() => restoreDefaultMutation.mutate()}
										>
											<Trans>Restore defaults</Trans>
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					</div>
				) : null}

				<div className={hasBundledDefault ? "pt-6" : "pt-2"}>
					<div className="flex items-center justify-between gap-8">
						<div className="min-w-0 flex-1">
							<div className="text-sm font-medium">
								<Trans>Delete agent</Trans>
							</div>
							<p className="text-sm text-muted-foreground mt-0.5">
								<Trans>Removes this agent from this device only.</Trans>
							</p>
						</div>
						<Button
							variant="destructive"
							size="sm"
							onClick={() => removeMutation.mutate()}
							disabled={removeMutation.isPending}
							className="shrink-0 gap-1.5"
						>
							<Trash2 className="size-3.5" />
							<Trans>Delete</Trans>
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
