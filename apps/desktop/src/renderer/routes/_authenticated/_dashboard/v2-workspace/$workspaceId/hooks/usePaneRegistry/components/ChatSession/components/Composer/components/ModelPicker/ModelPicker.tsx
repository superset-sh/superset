import type { SessionConfigOption } from "@superset/chat/protocol";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuPortal,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { type KeyboardEvent, useRef, useState } from "react";
import { LuCheck, LuChevronDown, LuZap } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import {
	MENU_PANEL_CLASS,
	MENU_ROW_CLASS,
	PILL_CHEVRON_CLASS,
	PILL_TRIGGER_CLASS,
} from "../../constants";
import { EffortSliderCard } from "./components/EffortSliderCard";
import { ModelPanel } from "./components/ModelPanel";
import type { AgentSwitcher } from "./types";

export type ModelPickerProps = {
	configOptions: SessionConfigOption[];
	onSelect: (configId: string, value: string) => void;
	agentSwitcher?: AgentSwitcher;
};

const TRAIT_ROW_CLASS = cn(
	MENU_ROW_CLASS,
	"[&>svg:last-child]:size-3 [&>svg:last-child]:text-muted-foreground/70",
);

function isToggle(option: SessionConfigOption) {
	return (
		option.options.length === 2 &&
		option.options.some((entry) => entry.id === "on") &&
		option.options.some((entry) => entry.id === "off")
	);
}

function currentLabel(option: SessionConfigOption | undefined) {
	return option?.options.find((entry) => entry.id === option.currentValue)
		?.label;
}

export function ModelPicker({
	agentSwitcher,
	configOptions,
	onSelect,
}: ModelPickerProps) {
	const [open, setOpen] = useState(false);
	const searchRef = useRef<HTMLInputElement>(null);
	const isDark = useIsDarkTheme();
	const agentIcon = agentSwitcher
		? getPresetIcon(agentSwitcher.currentPresetId, isDark)
		: undefined;
	const model = configOptions.find(
		(option) => option.category === "model" && option.options.length > 0,
	);
	const canSwitchAgent = (agentSwitcher?.agents.length ?? 0) > 1;
	const settings = configOptions.filter(
		(option) =>
			option.category !== "model" &&
			option.category !== "mode" &&
			option.options.length > 0,
	);
	const fast = settings.find(
		(option) => option.id === "fast" && isToggle(option),
	);
	const fastOn = fast?.currentValue === "on";
	const effort = settings.find((option) => option.category === "thought_level");
	const effortLabel = currentLabel(effort);
	// The slider card owns effort and the fast toggle; the rest stay as rows.
	const rows = settings.filter(
		(option) => option !== effort && (effort ? option !== fast : true),
	);
	if (!model && settings.length === 0 && !canSwitchAgent) return null;
	const showsModels = Boolean(model) || canSwitchAgent;
	const currentAgentLabel = agentSwitcher?.agents.find(
		(agent) => agent.presetId === agentSwitcher.currentPresetId,
	)?.label;
	const pillLabel =
		currentLabel(model) ??
		model?.label ??
		currentAgentLabel ??
		settings[0]?.label;
	const pick = (option: SessionConfigOption, value: string) => {
		if (value !== option.currentValue) onSelect(option.id, value);
		setOpen(false);
	};
	// Hovering a row moves menu focus to it; typing must still reach the search.
	const sendTypingToSearch = (event: KeyboardEvent<HTMLDivElement>) => {
		const search = searchRef.current;
		if (!search || event.target === search) return;
		if (event.key.length !== 1 || event.key === " ") return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		event.stopPropagation();
		search.focus();
	};

	return (
		<div className="flex min-w-0 items-center gap-0.5">
			{fast ? (
				<button
					aria-label={fast.label}
					aria-pressed={fastOn}
					className={cn(
						"flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-foreground/[0.07] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
						fastOn ? "text-amber-500" : "text-muted-foreground/70",
					)}
					onClick={() => onSelect(fast.id, fastOn ? "off" : "on")}
					title={fast.label}
					type="button"
				>
					<LuZap className={cn("size-3.5", fastOn && "fill-current")} />
				</button>
			) : null}
			<DropdownMenu onOpenChange={setOpen} open={open}>
				<DropdownMenuTrigger asChild>
					<button className={cn(PILL_TRIGGER_CLASS, "group")} type="button">
						{agentIcon ? (
							<img
								alt=""
								className="size-3.5 shrink-0 object-contain"
								src={agentIcon}
							/>
						) : null}
						<span className="truncate">{pillLabel}</span>
						{effortLabel ? (
							<span className="shrink-0 text-muted-foreground">
								{effortLabel}
							</span>
						) : null}
						<LuChevronDown className={PILL_CHEVRON_CLASS} />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					className={cn(
						MENU_PANEL_CLASS,
						"flex w-[296px] flex-col overflow-hidden p-0",
					)}
					onKeyDownCapture={sendTypingToSearch}
					side="top"
				>
					{showsModels ? (
						<ModelPanel
							agentSwitcher={
								agentSwitcher && {
									...agentSwitcher,
									onSwitch: (presetId, picked) => {
										setOpen(false);
										agentSwitcher.onSwitch(presetId, picked);
									},
								}
							}
							model={model}
							onPick={(modelId) => {
								if (model) pick(model, modelId);
							}}
							searchRef={searchRef}
						/>
					) : null}
					{settings.length > 0 ? (
						<div
							className={cn(
								"flex flex-col gap-px p-1",
								showsModels && "border-t",
							)}
						>
							{effort ? (
								<EffortSliderCard
									effort={effort}
									fast={fast}
									onSelect={onSelect}
								/>
							) : null}
							{rows.map((option) => (
								<DropdownMenuSub key={option.id}>
									<DropdownMenuSubTrigger className={TRAIT_ROW_CLASS}>
										<span className="min-w-0 flex-1 truncate">
											{option.label}
										</span>
										<span className="max-w-28 truncate text-muted-foreground">
											{currentLabel(option)}
										</span>
									</DropdownMenuSubTrigger>
									{/* Portaled: the panel's backdrop-blur would otherwise contain and clip it. */}
									<DropdownMenuPortal>
										<DropdownMenuSubContent
											className={cn(MENU_PANEL_CLASS, "w-[200px]")}
										>
											{option.options.map((entry) => (
												<DropdownMenuItem
													className={MENU_ROW_CLASS}
													key={entry.id}
													onSelect={() => pick(option, entry.id)}
													title={entry.description}
												>
													<span className="min-w-0 flex-1 truncate">
														{entry.label}
													</span>
													{entry.id === option.currentValue ? (
														<LuCheck className="size-3.5 shrink-0" />
													) : null}
												</DropdownMenuItem>
											))}
										</DropdownMenuSubContent>
									</DropdownMenuPortal>
								</DropdownMenuSub>
							))}
						</div>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
