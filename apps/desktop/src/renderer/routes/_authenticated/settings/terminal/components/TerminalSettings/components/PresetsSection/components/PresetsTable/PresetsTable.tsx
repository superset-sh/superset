import type { TerminalPreset } from "@superset/local-db";
import type { RefObject } from "react";
import { PresetRow } from "../../../PresetRow";
import type { PresetProjectOption } from "../../preset-project-options";

interface PresetsTableProps {
	presets: TerminalPreset[];
	isLoading: boolean;
	projectOptionsById: ReadonlyMap<string, PresetProjectOption>;
	presetsContainerRef: RefObject<HTMLDivElement | null>;
	onEdit: (presetId: string) => void;
	onLocalReorder: (fromIndex: number, toIndex: number) => void;
	onPersistReorder: (presetId: string, targetIndex: number) => void;
	onToggleVisibility: (presetId: string, visible: boolean) => void;
}

export function PresetsTable({
	presets,
	isLoading,
	projectOptionsById,
	presetsContainerRef,
	onEdit,
	onLocalReorder,
	onPersistReorder,
	onToggleVisibility,
}: PresetsTableProps) {
	return (
		<div
			ref={presetsContainerRef}
			className="rounded-lg border border-border overflow-hidden divide-y divide-border max-h-[420px] overflow-y-auto"
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
						projectOptionsById={projectOptionsById}
						onEdit={onEdit}
						onLocalReorder={onLocalReorder}
						onPersistReorder={onPersistReorder}
						onToggleVisibility={onToggleVisibility}
					/>
				))
			) : (
				<div className="py-10 text-center text-sm text-muted-foreground">
					No presets yet. Click "Add preset" to create your first one.
				</div>
			)}
		</div>
	);
}
