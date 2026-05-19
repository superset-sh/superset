"use client";

import { getPresetById } from "@superset/shared/host-agent-presets";
import { getPresetIcon } from "@superset/ui/icons/preset-icons";
import { Loader2, Settings, Terminal } from "lucide-react";
import Image from "next/image";
import type { HostAgentConfig } from "../../../../../trpc/host-client";

interface WebTerminalPresetsBarProps {
	presets: HostAgentConfig[] | null;
	runningPresetId: string | null;
	disabled?: boolean;
	onRunPreset: (preset: HostAgentConfig) => void;
}

export function WebTerminalPresetsBar({
	presets,
	runningPresetId,
	disabled = false,
	onRunPreset,
}: WebTerminalPresetsBarProps) {
	if (presets === null) {
		return (
			<div
				className="flex h-9 shrink-0 items-center gap-2 overflow-hidden border-b px-3 text-xs text-[#a8a5a3]"
				style={{ borderColor: "#2a2827", backgroundColor: "#171413" }}
			>
				<Loader2 className="size-3.5 animate-spin" />
				<span>Loading presets...</span>
			</div>
		);
	}

	if (presets.length === 0) return null;

	return (
		<div
			className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-b px-2"
			style={{
				borderColor: "#2a2827",
				backgroundColor: "#0d0908",
				scrollbarWidth: "none",
			}}
		>
			<button
				type="button"
				title="Manage presets"
				aria-label="Manage presets"
				className="flex size-6 shrink-0 items-center justify-center rounded-md text-[#8f8983] transition-colors hover:bg-[#211d1b] hover:text-[#f3f0ed]"
			>
				<Settings className="size-4" />
			</button>
			<div className="mx-1 h-4 w-px shrink-0 bg-[#2a2827]" />
			{presets.map((preset) => {
				const details = getPresetById(preset.presetId);
				const icon = getPresetIcon(preset.presetId, true);
				const isRunning = runningPresetId === preset.id;
				const label = preset.label || details?.label || preset.command;
				const title = details?.description
					? `${label}: ${details.description}`
					: `Run ${label}`;

				return (
					<button
						key={preset.id}
						type="button"
						title={title}
						aria-label={`Run ${label}`}
						onClick={() => onRunPreset(preset)}
						disabled={disabled || isRunning}
						className="flex h-6 max-w-36 shrink-0 items-center gap-2 rounded-md border border-transparent px-1.5 text-sm text-[#8f8172] transition-colors hover:border-[#3a3633] hover:bg-[#211d1b] hover:text-[#d9d2cb] disabled:cursor-not-allowed disabled:opacity-55"
					>
						{isRunning ? (
							<Loader2 className="size-4 shrink-0 animate-spin" />
						) : icon ? (
							<Image
								src={icon}
								alt=""
								width={16}
								height={16}
								className="size-4 shrink-0 object-contain"
							/>
						) : (
							<Terminal className="size-4 shrink-0" />
						)}
						<span className="min-w-0 truncate">{label}</span>
					</button>
				);
			})}
		</div>
	);
}
