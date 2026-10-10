import { Trans } from "@lingui/react/macro";
import type { SessionConfigOption } from "@superset/chat/protocol";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
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
	MENU_ROW_CLASS,
	PILL_CHEVRON_CLASS,
	PILL_TRIGGER_CLASS,
} from "../../constants";
import { ModelFlyout } from "./components/ModelFlyout";
import type { AgentSwitcher } from "./types";

export type ModelPickerProps = {
	configOptions: SessionConfigOption[];
	onSelect: (configId: string, value: string) => void;
	agentSwitcher?: AgentSwitcher;
};

const SUB_TRIGGER_CLASS = cn(MENU_ROW_CLASS, "h-9 text-[13px]");

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
	const toggles = settings.filter(isToggle);
	const selects = settings.filter((option) => !isToggle(option));
	const fastOn = toggles.some(
		(option) => option.id === "fast" && option.currentValue === "on",
	);
	const effortLabel = currentLabel(
		settings.find((option) => option.category === "thought_level"),
	);
	if (!model && settings.length === 0 && !canSwitchAgent) return null;
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
		<DropdownMenu onOpenChange={setOpen} open={open}>
			<DropdownMenuTrigger asChild>
				<button className={cn(PILL_TRIGGER_CLASS, "group")} type="button">
					{agentIcon ? (
						<img
							alt=""
							className="size-3.5 shrink-0 object-contain"
							draggable={false}
							src={agentIcon}
						/>
					) : null}
					<span className="truncate">{pillLabel}</span>
					{effortLabel ? (
						<span className="shrink-0 text-muted-foreground">
							{effortLabel}
						</span>
					) : null}
					{fastOn ? <LuZap className="size-3 shrink-0 fill-current" /> : null}
					<LuChevronDown className={PILL_CHEVRON_CLASS} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-[250px] rounded-xl"
				onKeyDownCapture={sendTypingToSearch}
				side="top"
			>
				{toggles.map((option) => {
					const on = option.currentValue === "on";
					return (
						<DropdownMenuItem
							aria-checked={on}
							className={SUB_TRIGGER_CLASS}
							key={option.id}
							onSelect={(event) => {
								event.preventDefault();
								onSelect(option.id, on ? "off" : "on");
							}}
							role="menuitemcheckbox"
						>
							<span className="min-w-0 flex-1 truncate">{option.label}</span>
							<span
								aria-hidden="true"
								className={cn(
									"relative h-5 w-9 shrink-0 rounded-full transition-colors",
									on ? "bg-foreground/40" : "bg-foreground/15",
								)}
							>
								<span
									className={cn(
										"absolute top-0.5 size-4 rounded-full bg-foreground shadow-sm transition-transform",
										on ? "translate-x-[18px]" : "translate-x-0.5",
									)}
								/>
							</span>
						</DropdownMenuItem>
					);
				})}
				{selects.map((option) => (
					<DropdownMenuSub key={option.id}>
						<DropdownMenuSubTrigger className={SUB_TRIGGER_CLASS}>
							<span className="min-w-0 flex-1 truncate">{option.label}</span>
							<span className="max-w-28 truncate text-muted-foreground">
								{currentLabel(option)}
							</span>
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="w-[210px] rounded-xl">
							{option.options.map((entry) => (
								<DropdownMenuItem
									className={MENU_ROW_CLASS}
									key={entry.id}
									onSelect={() => pick(option, entry.id)}
									title={entry.description}
								>
									<span className="min-w-0 flex-1 truncate">{entry.label}</span>
									{entry.id === option.currentValue ? (
										<LuCheck className="size-3.5 shrink-0" />
									) : null}
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				))}
				{model || canSwitchAgent ? (
					<DropdownMenuSub>
						<DropdownMenuSubTrigger className={SUB_TRIGGER_CLASS}>
							<span className="min-w-0 flex-1 truncate">
								<Trans>Model</Trans>
							</span>
							<span className="flex max-w-36 min-w-0 items-center gap-1 text-muted-foreground">
								{agentIcon ? (
									<img
										alt=""
										className="size-3.5 shrink-0 object-contain"
										draggable={false}
										src={agentIcon}
									/>
								) : null}
								<span className="truncate">
									{currentLabel(model) ?? <Trans>Default</Trans>}
								</span>
							</span>
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent
							className="flex h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] w-[310px] flex-row overflow-hidden rounded-xl p-0"
							onKeyDownCapture={sendTypingToSearch}
						>
							<ModelFlyout
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
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
