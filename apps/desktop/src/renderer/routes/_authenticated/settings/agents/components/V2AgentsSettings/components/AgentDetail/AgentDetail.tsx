import type {
	HostAgentConfigDto,
	PromptTransport,
} from "@superset/host-service/settings";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	joinArgs,
	joinCommandArgs,
	parseArgs,
	parseCommandString,
} from "../../../utils/argv";

interface AgentDetailProps {
	config: HostAgentConfigDto;
	description: string;
	onChanged: () => void;
	onDeleted: () => void;
}

export function AgentDetail({
	config,
	description,
	onChanged,
	onDeleted,
}: AgentDetailProps) {
	const { activeHostUrl } = useLocalHostService();
	const isDark = useIsDarkTheme();
	const icon = getPresetIcon(config.presetId, isDark);

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
			).settings.agentConfigs.update.mutate({ id: config.id, patch });
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
			).settings.agentConfigs.remove.mutate({ id: config.id });
		},
		onSuccess: () => onDeleted(),
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
		const prev = promptTransport;
		setPromptTransport(next);
		updateMutation.mutate(
			{ promptTransport: next },
			{ onError: () => setPromptTransport(prev) },
		);
	};

	return (
		<div className="p-6 max-w-3xl w-full mx-auto">
			<div className="mb-8 flex items-start gap-3">
				{icon ? (
					<img
						src={icon}
						alt=""
						className="size-8 object-contain shrink-0 mt-0.5"
					/>
				) : null}
				<div className="min-w-0 flex-1">
					<h2 className="text-xl font-semibold truncate">{config.label}</h2>
					<p className="text-sm text-muted-foreground mt-1">{description}</p>
				</div>
			</div>

			<div className="space-y-3">
				<AgentField
					label="Label"
					hint="Name shown in launchers."
					htmlFor={`label-${config.id}`}
				>
					<Input
						id={`label-${config.id}`}
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						onBlur={handleLabelBlur}
						className="w-full"
					/>
				</AgentField>
				<AgentField
					label="Command"
					hint="Argv used for launches. The prompt is appended after the prompt-only args."
					htmlFor={`command-${config.id}`}
				>
					<Input
						id={`command-${config.id}`}
						className="w-full font-mono text-xs"
						value={commandText}
						onChange={(e) => setCommandText(e.target.value)}
						onBlur={handleCommandBlur}
						placeholder="claude --permission-mode acceptEdits"
					/>
				</AgentField>
				<AgentField
					label="Prompt-only args"
					hint={
						<>
							Inserted only when launching with a prompt. Examples:{" "}
							<code>--</code> (codex), <code>--prompt</code> (opencode),{" "}
							<code>-i</code> (copilot).
						</>
					}
					htmlFor={`prompt-args-${config.id}`}
				>
					<Input
						id={`prompt-args-${config.id}`}
						className="w-full font-mono text-xs"
						value={promptArgsText}
						onChange={(e) => setPromptArgsText(e.target.value)}
						onBlur={handlePromptArgsBlur}
						placeholder="--prompt"
					/>
				</AgentField>
				<AgentField
					label="Prompt transport"
					hint={
						<>
							<code>argv</code> appends the prompt as the last argv;{" "}
							<code>stdin</code> pipes it to the process's stdin.
						</>
					}
				>
					<div className="inline-flex rounded-md border border-border overflow-hidden w-fit">
						<button
							type="button"
							onClick={() => handleTransportChange("argv")}
							className={cn(
								"px-3 py-1 text-xs font-medium transition-colors",
								promptTransport === "argv"
									? "bg-accent text-accent-foreground"
									: "bg-transparent text-muted-foreground hover:bg-accent/50",
							)}
						>
							argv
						</button>
						<button
							type="button"
							onClick={() => handleTransportChange("stdin")}
							className={cn(
								"px-3 py-1 text-xs font-medium transition-colors border-l border-border",
								promptTransport === "stdin"
									? "bg-accent text-accent-foreground"
									: "bg-transparent text-muted-foreground hover:bg-accent/50",
							)}
						>
							stdin
						</button>
					</div>
				</AgentField>

				<div className="pt-5 flex items-center justify-between gap-6">
					<div className="min-w-0 flex-1">
						<div className="text-sm font-medium">Delete this agent</div>
						<p className="text-xs text-muted-foreground mt-0.5">
							Removes it from launchers on this host. Other hosts are not
							affected.
						</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => removeMutation.mutate()}
						disabled={removeMutation.isPending}
						className="gap-1.5 hover:text-destructive hover:border-destructive/30"
					>
						<Trash2 className="size-3.5" />
						Delete
					</Button>
				</div>
			</div>
		</div>
	);
}

interface AgentFieldProps {
	label: string;
	hint?: React.ReactNode;
	htmlFor?: string;
	children: React.ReactNode;
}

function AgentField({ label, hint, htmlFor, children }: AgentFieldProps) {
	return (
		<div className="flex items-start justify-between gap-6">
			<div className="min-w-0 flex-1">
				<Label htmlFor={htmlFor} className="text-sm font-medium">
					{label}
				</Label>
				{hint && (
					<p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
				)}
			</div>
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}
