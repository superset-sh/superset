import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
	HostAgentConfigDto,
	PromptTransport,
} from "@superset/host-service/settings";
import { Button } from "@superset/ui/button";
import { Collapsible, CollapsibleContent } from "@superset/ui/collapsible";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useMutation } from "@tanstack/react-query";
import { ChevronDownIcon, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { LuGripVertical } from "react-icons/lu";
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

interface V2AgentCardProps {
	config: HostAgentConfigDto;
	description: string;
	onChanged: () => void;
}

export function V2AgentCard({
	config,
	description,
	onChanged,
}: V2AgentCardProps) {
	const { activeHostUrl } = useLocalHostService();
	const isDark = useIsDarkTheme();
	const icon = getPresetIcon(config.presetId, isDark);

	const {
		setNodeRef,
		setActivatorNodeRef,
		attributes,
		listeners,
		isDragging,
		transform,
		transition,
	} = useSortable({ id: config.id });

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
		const prev = promptTransport;
		setPromptTransport(next);
		updateMutation.mutate(
			{ promptTransport: next },
			{ onError: () => setPromptTransport(prev) },
		);
	};

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Translate.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : undefined,
			}}
			className={cn(isDragging && "bg-accent/40 relative z-10")}
		>
			<Collapsible open={isOpen} onOpenChange={setIsOpen}>
				{/* biome-ignore lint/a11y/useSemanticElements: div needed to avoid invalid nested <button> elements */}
				<div
					role="button"
					tabIndex={0}
					aria-expanded={isOpen}
					className="flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
					onClick={() => setIsOpen((open) => !open)}
					onKeyDown={(event) => {
						if (event.target !== event.currentTarget) return;
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							setIsOpen((open) => !open);
						}
					}}
				>
					<button
						type="button"
						ref={setActivatorNodeRef}
						{...attributes}
						{...listeners}
						onClick={(event) => event.stopPropagation()}
						className="shrink-0 flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-accent rounded p-1 -m-1 cursor-grab active:cursor-grabbing bg-transparent border-0"
						aria-label="Drag to reorder"
					>
						<LuGripVertical className="size-4" />
					</button>
					{icon ? (
						<img src={icon} alt="" className="size-7 object-contain shrink-0" />
					) : null}
					<div className="min-w-0 flex-1">
						<div className="text-sm font-medium truncate">{config.label}</div>
						<div className="text-xs text-muted-foreground truncate">
							{description}
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-1">
						<Button
							variant="ghost"
							size="icon"
							onClick={(event) => {
								event.stopPropagation();
								removeMutation.mutate();
							}}
							disabled={removeMutation.isPending}
							aria-label={`Remove ${config.label}`}
							className="text-muted-foreground hover:text-destructive"
						>
							<Trash2 className="size-4" />
						</Button>
						<ChevronDownIcon
							aria-hidden="true"
							className={cn(
								"size-4 text-muted-foreground transition-transform duration-200",
								isOpen && "rotate-180",
							)}
						/>
					</div>
				</div>
				<CollapsibleContent>
					<div className="grid gap-4 px-4 pb-4 pt-0">
						<div className="grid gap-1.5">
							<Label htmlFor={`label-${config.id}`} className="text-xs">
								Label
							</Label>
							<Input
								id={`label-${config.id}`}
								value={label}
								onChange={(e) => setLabel(e.target.value)}
								onBlur={handleLabelBlur}
							/>
						</div>

						<div className="grid gap-4 pt-4 border-t border-border">
							<div className="grid gap-1.5">
								<Label htmlFor={`command-${config.id}`} className="text-xs">
									Command
								</Label>
								<Input
									id={`command-${config.id}`}
									className="font-mono text-xs"
									value={commandText}
									onChange={(e) => setCommandText(e.target.value)}
									onBlur={handleCommandBlur}
									placeholder="claude --permission-mode acceptEdits"
								/>
								<p className="text-xs text-muted-foreground">
									Argv for promptless launches. The prompt is appended after the
									prompt-only args.
								</p>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor={`prompt-args-${config.id}`} className="text-xs">
									Prompt-only args
								</Label>
								<Input
									id={`prompt-args-${config.id}`}
									className="font-mono text-xs"
									value={promptArgsText}
									onChange={(e) => setPromptArgsText(e.target.value)}
									onBlur={handlePromptArgsBlur}
									placeholder="--prompt"
								/>
								<p className="text-xs text-muted-foreground">
									Inserted only when launching with a prompt. Examples:{" "}
									<code>--</code> (codex), <code>--prompt</code> (opencode),{" "}
									<code>-i</code> (copilot).
								</p>
							</div>
							<div className="grid gap-1.5">
								<Label className="text-xs">Prompt transport</Label>
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
								<p className="text-xs text-muted-foreground">
									<code>argv</code> appends the prompt as the last argv;{" "}
									<code>stdin</code> pipes it to the process's stdin.
								</p>
							</div>
						</div>
					</div>
				</CollapsibleContent>
			</Collapsible>
		</div>
	);
}
