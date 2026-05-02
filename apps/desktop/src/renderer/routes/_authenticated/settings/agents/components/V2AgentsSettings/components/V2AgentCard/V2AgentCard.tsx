import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
	HostAgentConfigDto,
	PromptTransport,
} from "@superset/host-service/settings";
import { Button } from "@superset/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardTitle,
} from "@superset/ui/card";
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
		>
			<Card className="p-0">
				<Collapsible open={isOpen} onOpenChange={setIsOpen}>
					{/* biome-ignore lint/a11y/useSemanticElements: div needed to avoid invalid nested <button> elements */}
					<div
						role="button"
						tabIndex={0}
						aria-expanded={isOpen}
						className="flex items-center gap-3 p-4 cursor-pointer transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
							className="shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing -ml-1 bg-transparent border-0 p-0"
							aria-label="Drag to reorder"
						>
							<LuGripVertical className="size-4" />
						</button>
						{icon ? (
							<img
								src={icon}
								alt=""
								className="size-8 object-contain shrink-0"
							/>
						) : (
							<div className="size-8 rounded-lg bg-muted shrink-0" />
						)}
						<div className="min-w-0 flex-1">
							<CardTitle className="truncate">{config.label}</CardTitle>
							<CardDescription className="mt-1 truncate">
								{description}
							</CardDescription>
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
						<CardContent className="grid gap-4 pt-0 pb-4">
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
									Argv used for promptless launches. The prompt is appended
									after the prompt-only args.
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
										variant={
											promptTransport === "stdin" ? "default" : "outline"
										}
										onClick={() => handleTransportChange("stdin")}
									>
										stdin
									</Button>
								</div>
								<p className="text-xs text-muted-foreground">
									<strong>argv</strong>: append the prompt as the last argv
									element. <strong>stdin</strong>: pipe the prompt to the
									spawned process's stdin.
								</p>
							</div>
						</CardContent>
					</CollapsibleContent>
				</Collapsible>
			</Card>
		</div>
	);
}
