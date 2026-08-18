import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { Check, ChevronDown, ImagePlus } from "lucide-react";
import { useState } from "react";
import { isDataImageUri } from "renderer/assets/app-icons/preset-icons";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AgentIcon } from "../AgentIcon";
import { AGENT_ICON_OPTIONS } from "./agent-icon-options";
import { resizeImageDataUrl } from "./resize-image";

interface AgentIconPickerProps {
	/**
	 * Current icon: a built-in icon key, an uploaded `data:` image URI, or null
	 * for the neutral fallback glyph.
	 */
	value: string | null;
	onChange: (iconId: string | null) => void;
	disabled?: boolean;
}

export function AgentIconPicker({
	value,
	onChange,
	disabled,
}: AgentIconPickerProps) {
	const selectImageMutation = electronTrpc.window.selectImageFile.useMutation();
	// Covers the whole flow (native dialog → mutate → resize), not just the
	// mutation, so re-entrant clicks can't fire overlapping selections.
	const [isProcessing, setIsProcessing] = useState(false);
	const uploaded = value !== null && isDataImageUri(value);
	const selected = AGENT_ICON_OPTIONS.find((option) => option.id === value);

	const handleUpload = async () => {
		if (isProcessing) return;
		setIsProcessing(true);
		try {
			const result = await selectImageMutation.mutateAsync();
			if (result.canceled || !result.dataUrl) return;
			const resized = await resizeImageDataUrl(result.dataUrl);
			onChange(resized);
		} catch {
			toast.error("Failed to load image");
		} finally {
			setIsProcessing(false);
		}
	};

	const triggerLabel = uploaded
		? "Custom image"
		: (selected?.label ?? "No icon");

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					disabled={disabled || isProcessing}
					className={cn(
						"inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm",
						"bg-transparent hover:bg-accent/50 transition-colors disabled:opacity-50",
					)}
				>
					<AgentIcon iconId={value} presetId="custom" className="size-5" />
					<span className="flex-1 text-left">{triggerLabel}</span>
					<ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-48">
				<DropdownMenuItem
					className="gap-2"
					disabled={isProcessing}
					onSelect={(e) => {
						e.preventDefault();
						void handleUpload();
					}}
				>
					<ImagePlus className="size-4 shrink-0 text-muted-foreground" />
					<span className="flex-1">Upload image…</span>
					{uploaded ? <Check className="size-3.5 shrink-0" /> : null}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem className="gap-2" onSelect={() => onChange(null)}>
					<AgentIcon iconId={null} presetId="custom" className="size-4" />
					<span className="flex-1">No icon</span>
					{value === null ? <Check className="size-3.5 shrink-0" /> : null}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				{AGENT_ICON_OPTIONS.map((option) => (
					<DropdownMenuItem
						key={option.id}
						className="gap-2"
						onSelect={() => onChange(option.id)}
					>
						<AgentIcon
							iconId={option.id}
							presetId="custom"
							className="size-4"
						/>
						<span className="flex-1">{option.label}</span>
						{value === option.id ? (
							<Check className="size-3.5 shrink-0" />
						) : null}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
