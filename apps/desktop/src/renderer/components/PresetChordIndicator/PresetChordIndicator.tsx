import { Kbd } from "@superset/ui/kbd";
import { cn } from "@superset/ui/lib/utils";
import { usePresets } from "renderer/react-query/presets";
import { usePresetChordStore } from "renderer/stores/preset-chord-store";
import { MAX_VISIBLE_PRESETS } from "shared/constants";

export function PresetChordIndicator() {
	const isChordActive = usePresetChordStore((s) => s.isChordActive);
	const { presets, isLoading } = usePresets();
	const visiblePresets = presets.slice(0, MAX_VISIBLE_PRESETS);

	if (!isChordActive) return null;

	return (
		<div
			className={cn(
				"fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
				"bg-popover/95 backdrop-blur-sm text-popover-foreground",
				"rounded-lg border border-border shadow-lg",
				"px-4 py-3",
				"animate-in fade-in slide-in-from-bottom-2 duration-150",
			)}
		>
			{isLoading ? (
				<span className="text-sm text-muted-foreground">Loading presets…</span>
			) : visiblePresets.length > 0 ? (
				<div className="flex items-center gap-4">
					{visiblePresets.map((preset, index) => (
						<div key={preset.id} className="flex items-center gap-1.5">
							<Kbd>{index + 1}</Kbd>
							<span className="text-sm text-foreground/80">
								{preset.name || `Preset ${index + 1}`}
							</span>
						</div>
					))}
				</div>
			) : (
				<span className="text-sm text-muted-foreground">
					No presets configured
				</span>
			)}
		</div>
	);
}
