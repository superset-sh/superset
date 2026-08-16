import type {
	AgentContextWindowSupport,
	AgentEffortSupport,
	AgentModeSupport,
	AgentSpeedSupport,
} from "@superset/shared/agent-models";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface WorkspaceAgentTraitsPickerProps {
	effortSupport?: AgentEffortSupport;
	modeSupport?: AgentModeSupport;
	speedSupport?: AgentSpeedSupport;
	contextWindowSupport?: AgentContextWindowSupport;
	effort: string | null;
	mode: string | null;
	speed: string | null;
	contextWindow: string | null;
	onEffortChange: (effort: string | null) => void;
	onModeChange: (mode: string | null) => void;
	onSpeedChange: (speed: string | null) => void;
	onContextWindowChange: (contextWindow: string | null) => void;
	triggerClassName?: string;
}

export function WorkspaceAgentTraitsPicker({
	effortSupport,
	modeSupport,
	speedSupport,
	contextWindowSupport,
	effort,
	mode,
	speed,
	contextWindow,
	onEffortChange,
	onModeChange,
	onSpeedChange,
	onContextWindowChange,
	triggerClassName,
}: WorkspaceAgentTraitsPickerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const activeItemRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (isOpen) activeItemRef.current?.focus();
	}, [isOpen]);

	const effectiveEffort =
		effort ?? effortSupport?.defaultEffortId ?? effortSupport?.efforts[0]?.id;
	const effectiveMode =
		mode ?? modeSupport?.defaultModeId ?? modeSupport?.modes[0]?.id;
	const effectiveSpeed =
		speed ?? speedSupport?.defaultSpeedId ?? speedSupport?.speeds[0]?.id;
	const effectiveContextWindow =
		contextWindow ?? contextWindowSupport?.defaultContextWindowId;
	const effortLabel = effortSupport?.efforts.find(
		(option) => option.id === effectiveEffort,
	)?.label;
	const speedLabel = speedSupport?.speeds.find(
		(option) => option.id === effectiveSpeed,
	)?.label;
	const modeLabel = modeSupport?.modes.find(
		(option) => option.id === effectiveMode,
	)?.label;
	const contextWindowLabel = contextWindowSupport?.contextWindows.find(
		(option) => option.id === effectiveContextWindow,
	)?.label;
	const isNonDefaultSpeed =
		effectiveSpeed !== undefined &&
		effectiveSpeed !== speedSupport?.defaultSpeedId;
	const triggerLabel = [
		effortLabel,
		modeLabel,
		contextWindowLabel,
		isNonDefaultSpeed ? speedLabel : null,
		!effortSupport && !contextWindowSupport ? speedLabel : null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					className={cn(triggerClassName, "justify-between")}
				>
					<span className="truncate">{triggerLabel}</span>
					<ChevronDownIcon className="size-3 shrink-0 opacity-50" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				side="top"
				sideOffset={6}
				className="w-44 rounded-lg border-border/80 p-1.5 shadow-xl"
			>
				{effortSupport && (
					<DropdownMenuRadioGroup
						value={effectiveEffort}
						onValueChange={onEffortChange}
					>
						<DropdownMenuLabel className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
							{effortSupport.label ?? "Reasoning"}
						</DropdownMenuLabel>
						{effortSupport.efforts.map((option) => (
							<DropdownMenuRadioItem
								key={option.id}
								ref={option.id === effectiveEffort ? activeItemRef : undefined}
								value={option.id}
								className="py-1.5 pr-8 pl-2 text-xs [&>span:first-child]:right-2 [&>span:first-child]:left-auto"
							>
								{option.label}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				)}
				{speedSupport && (
					<DropdownMenuRadioGroup
						value={effectiveSpeed}
						onValueChange={onSpeedChange}
					>
						{effortSupport && <DropdownMenuSeparator />}
						<DropdownMenuLabel className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
							{speedSupport.label}
						</DropdownMenuLabel>
						{speedSupport.speeds.map((option) => (
							<DropdownMenuRadioItem
								key={option.id}
								ref={
									!effortSupport &&
									!contextWindowSupport &&
									option.id === effectiveSpeed
										? activeItemRef
										: undefined
								}
								value={option.id}
								className="py-1.5 pr-8 pl-2 text-xs [&>span:first-child]:right-2 [&>span:first-child]:left-auto"
							>
								{option.label}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				)}
				{modeSupport && (
					<DropdownMenuRadioGroup
						value={effectiveMode}
						onValueChange={onModeChange}
					>
						{(effortSupport || speedSupport) && <DropdownMenuSeparator />}
						<DropdownMenuLabel className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
							{modeSupport.label}
						</DropdownMenuLabel>
						{modeSupport.modes.map((option) => (
							<DropdownMenuRadioItem
								key={option.id}
								ref={
									!effortSupport && !speedSupport && option.id === effectiveMode
										? activeItemRef
										: undefined
								}
								value={option.id}
								className="py-1.5 pr-8 pl-2 text-xs [&>span:first-child]:right-2 [&>span:first-child]:left-auto"
							>
								{option.label}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				)}
				{contextWindowSupport && (
					<DropdownMenuRadioGroup
						value={effectiveContextWindow}
						onValueChange={onContextWindowChange}
					>
						{(effortSupport || speedSupport || modeSupport) && (
							<DropdownMenuSeparator />
						)}
						<DropdownMenuLabel className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
							Context Window
						</DropdownMenuLabel>
						{contextWindowSupport.contextWindows.map((option) => (
							<DropdownMenuRadioItem
								key={option.id}
								ref={
									!effortSupport && option.id === effectiveContextWindow
										? activeItemRef
										: undefined
								}
								value={option.id}
								className="py-1.5 pr-8 pl-2 text-xs [&>span:first-child]:right-2 [&>span:first-child]:left-auto"
							>
								{option.label}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
