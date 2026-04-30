import type {
	AgentPreset,
	HostAgentConfigDto,
	PromptTransport,
} from "@superset/host-service/settings";
import { Button } from "@superset/ui/button";
import { Card, CardContent } from "@superset/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	joinArgs,
	joinCommandArgs,
	parseArgs,
	parseCommandString,
} from "./utils/argv";

const QUERY_KEY = ["host-agent-configs"] as const;

export function V2AgentsSettings() {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();

	const configsQuery = useQuery({
		queryKey: [...QUERY_KEY, activeHostUrl] as const,
		enabled: !!activeHostUrl,
		queryFn: () => {
			if (!activeHostUrl) return [] as HostAgentConfigDto[];
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.list.query();
		},
	});

	const presetsQuery = useQuery({
		queryKey: [...QUERY_KEY, "presets", activeHostUrl] as const,
		enabled: !!activeHostUrl,
		queryFn: () => {
			if (!activeHostUrl) return [] as AgentPreset[];
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.listPresets.query();
		},
	});

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, activeHostUrl] });

	const addMutation = useMutation({
		mutationFn: (presetId: string) => {
			if (!activeHostUrl) throw new Error("Host service is not available");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.add.mutate({
				presetId,
			});
		},
		onSuccess: () => invalidate(),
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to add agent"),
	});

	const reorderMutation = useMutation({
		mutationFn: (ids: string[]) => {
			if (!activeHostUrl) throw new Error("Host service is not available");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.reorder.mutate({ ids });
		},
		onSuccess: () => invalidate(),
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to reorder"),
	});

	const resetMutation = useMutation({
		mutationFn: () => {
			if (!activeHostUrl) throw new Error("Host service is not available");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.resetToDefaults.mutate();
		},
		onSuccess: () => invalidate(),
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to reset"),
	});

	const configs = configsQuery.data ?? [];
	const presets = presetsQuery.data ?? [];

	const moveAgent = (index: number, direction: -1 | 1) => {
		const target = index + direction;
		if (target < 0 || target >= configs.length) return;
		const ids = configs.map((row) => row.id);
		[ids[index], ids[target]] = [ids[target], ids[index]];
		reorderMutation.mutate(ids);
	};

	return (
		<div className="p-6 max-w-5xl w-full">
			<div className="mb-8 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold">Agents</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Configure terminal agents available on this host. Sent prompts are
						appended to the launch argv (or piped via stdin).
					</p>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="sm">
								<Plus className="size-4" /> Add agent
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{presets.map((preset) => (
								<DropdownMenuItem
									key={preset.presetId}
									onSelect={() => addMutation.mutate(preset.presetId)}
								>
									{preset.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => resetMutation.mutate()}
						disabled={resetMutation.isPending}
					>
						<RotateCcw className="size-4" /> Reset to defaults
					</Button>
				</div>
			</div>

			{configsQuery.isLoading ? (
				<p className="text-sm text-muted-foreground">
					Loading agent settings...
				</p>
			) : configs.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No agents configured. Add one from the dropdown above.
				</p>
			) : (
				<div className="space-y-3">
					{configs.map((config, index) => (
						<V2AgentCard
							key={config.id}
							config={config}
							canMoveUp={index > 0}
							canMoveDown={index < configs.length - 1}
							onMoveUp={() => moveAgent(index, -1)}
							onMoveDown={() => moveAgent(index, 1)}
							onChanged={() => invalidate()}
						/>
					))}
				</div>
			)}
		</div>
	);
}

interface V2AgentCardProps {
	config: HostAgentConfigDto;
	canMoveUp: boolean;
	canMoveDown: boolean;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onChanged: () => void;
}

function V2AgentCard({
	config,
	canMoveUp,
	canMoveDown,
	onMoveUp,
	onMoveDown,
	onChanged,
}: V2AgentCardProps) {
	const { activeHostUrl } = useLocalHostService();
	const [isOpen, setIsOpen] = useState(false);
	const [label, setLabel] = useState(config.label);
	const [commandText, setCommandText] = useState(
		joinCommandArgs(config.command, config.args),
	);
	const [promptArgsText, setPromptArgsText] = useState(
		joinArgs(config.promptArgs),
	);
	const [promptTransport, setPromptTransport] = useState<PromptTransport>(
		config.promptTransport,
	);

	useEffect(() => {
		setLabel(config.label);
		setCommandText(joinCommandArgs(config.command, config.args));
		setPromptArgsText(joinArgs(config.promptArgs));
		setPromptTransport(config.promptTransport);
	}, [
		config.label,
		config.command,
		config.args,
		config.promptArgs,
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
			if (!activeHostUrl) throw new Error("Host service is not available");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.update.mutate({
				id: config.id,
				patch,
			});
		},
		onSuccess: () => onChanged(),
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to save"),
	});

	const removeMutation = useMutation({
		mutationFn: () => {
			if (!activeHostUrl) throw new Error("Host service is not available");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.remove.mutate({
				id: config.id,
			});
		},
		onSuccess: () => onChanged(),
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to remove"),
	});

	const handleLabelBlur = () => {
		if (label !== config.label && label.trim().length > 0) {
			updateMutation.mutate({ label });
		}
	};

	const handleCommandBlur = () => {
		const { command, args } = parseCommandString(commandText);
		if (command.length === 0) {
			toast.error("Command cannot be empty");
			setCommandText(joinCommandArgs(config.command, config.args));
			return;
		}
		const changed =
			command !== config.command ||
			args.length !== config.args.length ||
			args.some((arg, i) => arg !== config.args[i]);
		if (changed) updateMutation.mutate({ command, args });
	};

	const handlePromptArgsBlur = () => {
		const args = parseArgs(promptArgsText);
		const changed =
			args.length !== config.promptArgs.length ||
			args.some((arg, i) => arg !== config.promptArgs[i]);
		if (changed) updateMutation.mutate({ promptArgs: args });
	};

	const handleTransportChange = (next: PromptTransport) => {
		if (next === promptTransport) return;
		setPromptTransport(next);
		updateMutation.mutate({ promptTransport: next });
	};

	return (
		<Card>
			<Collapsible open={isOpen} onOpenChange={setIsOpen}>
				<div className="flex items-center justify-between gap-3 px-4 py-3">
					<CollapsibleTrigger asChild>
						<button
							type="button"
							className="flex-1 flex items-center gap-3 text-left"
						>
							<span className="font-medium">{config.label}</span>
							<span className="text-xs text-muted-foreground font-mono truncate">
								{commandText}
							</span>
						</button>
					</CollapsibleTrigger>
					<div className="flex items-center gap-1 shrink-0">
						<Button
							variant="ghost"
							size="icon"
							disabled={!canMoveUp}
							onClick={onMoveUp}
						>
							<ChevronUp className="size-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							disabled={!canMoveDown}
							onClick={onMoveDown}
						>
							<ChevronDown className="size-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => removeMutation.mutate()}
							disabled={removeMutation.isPending}
						>
							<Trash2 className="size-4" />
						</Button>
					</div>
				</div>
				<CollapsibleContent>
					<CardContent className="grid gap-4 pt-2">
						<div className="grid gap-1.5">
							<Label htmlFor={`label-${config.id}`}>Label</Label>
							<Input
								id={`label-${config.id}`}
								value={label}
								onChange={(e) => setLabel(e.target.value)}
								onBlur={handleLabelBlur}
							/>
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor={`command-${config.id}`}>Command</Label>
							<Input
								id={`command-${config.id}`}
								className="font-mono"
								value={commandText}
								onChange={(e) => setCommandText(e.target.value)}
								onBlur={handleCommandBlur}
								placeholder="claude --permission-mode acceptEdits"
							/>
							<p className="text-xs text-muted-foreground">
								Argv used for promptless launches. The prompt is appended after
								the prompt-only args.
							</p>
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor={`prompt-args-${config.id}`}>
								Prompt-only args
							</Label>
							<Input
								id={`prompt-args-${config.id}`}
								className="font-mono"
								value={promptArgsText}
								onChange={(e) => setPromptArgsText(e.target.value)}
								onBlur={handlePromptArgsBlur}
								placeholder="(empty)"
							/>
							<p className="text-xs text-muted-foreground">
								Inserted only when launching with a prompt — e.g.{" "}
								<code>--</code> for codex, <code>--prompt</code> for opencode,{" "}
								<code>-i</code> for copilot.
							</p>
						</div>
						<div className="grid gap-1.5">
							<Label>Prompt transport</Label>
							<div className="flex gap-2">
								<Button
									type="button"
									size="sm"
									variant={promptTransport === "argv" ? "default" : "outline"}
									onClick={() => handleTransportChange("argv")}
								>
									argv
								</Button>
								<Button
									type="button"
									size="sm"
									variant={promptTransport === "stdin" ? "default" : "outline"}
									onClick={() => handleTransportChange("stdin")}
								>
									stdin
								</Button>
							</div>
							<p className="text-xs text-muted-foreground">
								<strong>argv</strong>: append the prompt as the last argv
								element. <strong>stdin</strong>: pipe the prompt to the spawned
								process's stdin.
							</p>
						</div>
					</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}
