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
} from "../../utils/argv";

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
			<div className="mb-8 flex items-center gap-3">
				{icon ? (
					<img
						src={icon}
						alt=""
						className="size-8 object-contain shrink-0"
					/>
				) : null}
				<div className="min-w-0 flex-1">
					<h2 className="text-xl font-semibold truncate">{config.label}</h2>
					<p className="text-sm text-muted-foreground mt-0.5 truncate">
						{description}
					</p>
				</div>
			</div>

			<div className="space-y-6">
				<Section title="Label">
					<Input
						id={`label-${config.id}`}
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						onBlur={handleLabelBlur}
					/>
				</Section>

				<Section title="Launch">
					<StackedField
						label="Command"
						hint="Argv used to launch the agent."
						htmlFor={`command-${config.id}`}
					>
						<Input
							id={`command-${config.id}`}
							className="font-mono text-xs"
							value={commandText}
							onChange={(e) => setCommandText(e.target.value)}
							onBlur={handleCommandBlur}
							placeholder="claude --permission-mode acceptEdits"
						/>
					</StackedField>

					<StackedField
						label="Prompt-only args"
						hint={
							<>
								Added only when launching with a prompt — e.g.{" "}
								<code>--</code>, <code>--prompt</code>, <code>-i</code>.
							</>
						}
						htmlFor={`prompt-args-${config.id}`}
					>
						<Input
							id={`prompt-args-${config.id}`}
							className="font-mono text-xs"
							value={promptArgsText}
							onChange={(e) => setPromptArgsText(e.target.value)}
							onBlur={handlePromptArgsBlur}
							placeholder="--prompt"
						/>
					</StackedField>

					<StackedField
						label="Prompt transport"
						hint="How the prompt is delivered to the process."
					>
						<div className="inline-flex rounded-md border border-border overflow-hidden">
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
					</StackedField>
				</Section>

				<div className="pt-2 border-t border-border">
					<div className="flex items-center justify-between gap-8">
						<div className="min-w-0 flex-1">
							<div className="text-sm font-medium">Delete agent</div>
							<p className="text-sm text-muted-foreground mt-0.5">
								Removes this agent from this device only.
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
							Delete
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

function Section({
	title,
	description,
	action,
	children,
}: {
	title: string;
	description?: string;
	action?: React.ReactNode;
	children?: React.ReactNode;
}) {
	return (
		<section className="space-y-3">
			<div className="flex items-start justify-between gap-6">
				<div className="min-w-0 flex-1">
					<h3 className="text-sm font-medium">{title}</h3>
					{description && (
						<p className="text-xs text-muted-foreground mt-0.5">
							{description}
						</p>
					)}
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</div>
			{children ? <div className="space-y-5">{children}</div> : null}
		</section>
	);
}

interface StackedFieldProps {
	label: string;
	hint?: React.ReactNode;
	htmlFor?: string;
	children: React.ReactNode;
}

function StackedField({ label, hint, htmlFor, children }: StackedFieldProps) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={htmlFor} className="text-sm font-medium">
				{label}
			</Label>
			{hint && <p className="text-xs text-muted-foreground -mt-1">{hint}</p>}
			{children}
		</div>
	);
}
