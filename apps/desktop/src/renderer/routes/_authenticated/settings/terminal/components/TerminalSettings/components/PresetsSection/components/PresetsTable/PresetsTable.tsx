import type { TerminalPreset } from "@superset/local-db";
import type { RefObject } from "react";
import { PresetRow } from "../../../PresetRow";

interface PresetsTableProps {
	presets: TerminalPreset[];
	isLoading: boolean;
	presetsContainerRef: RefObject<HTMLDivElement | null>;
	onEdit: (presetId: string) => void;
	onLocalReorder: (fromIndex: number, toIndex: number) => void;
	onPersistReorder: (presetId: string, targetIndex: number) => void;
}

export function PresetsTable({
	presets,
	isLoading,
	presetsContainerRef,
	onEdit,
	onLocalReorder,
	onPersistReorder,
}: PresetsTableProps) {
	return (
		<div className="rounded-lg border border-border overflow-hidden">
			<div className="flex items-center gap-4 py-2 px-4 bg-accent/10 border-b border-border text-xs font-medium text-muted-foreground uppercase tracking-wider">
				<div className="w-6 shrink-0" />
				<div className="flex-1 min-w-0">Preset</div>
				<div className="flex-[1.2] min-w-0">Commands</div>
				<div className="w-32 shrink-0">Mode</div>
				<div className="w-36 shrink-0">Auto-run</div>
			</div>

			<div
				ref={presetsContainerRef}
				className="max-h-[320px] overflow-y-auto overflow-x-auto"
			>
				{isLoading ? (
					<div className="py-8 text-center text-sm text-muted-foreground">
						Loading presets...
					</div>
				) : presets.length > 0 ? (
					presets.map((preset, index) => (
						<PresetRow
							key={preset.id}
							preset={preset}
							rowIndex={index}
							isEven={index % 2 === 0}
							onEdit={onEdit}
							onLocalReorder={onLocalReorder}
							onPersistReorder={onPersistReorder}
						/>
					))
				) : (
					<div className="py-8 text-center text-sm text-muted-foreground">
						No presets yet. Click "Add Preset" to create your first preset.
					</div>
				)}
			</div>
		</div>
	);
}
