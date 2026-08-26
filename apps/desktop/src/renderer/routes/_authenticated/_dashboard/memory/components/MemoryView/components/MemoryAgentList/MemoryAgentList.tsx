import { cn } from "@superset/ui/utils";
import { AgentIcon } from "renderer/components/AgentIcon";

export interface MemoryAgentRow {
	presetId: string;
	/** Existing memory files across global + project + auto-memory scopes. */
	fileCount: number;
	label: string;
	iconId: string | null;
}

interface MemoryAgentListProps {
	rows: MemoryAgentRow[];
	selectedPresetId: string | null;
	onSelect: (presetId: string) => void;
}

export function MemoryAgentList({
	rows,
	selectedPresetId,
	onSelect,
}: MemoryAgentListProps) {
	return (
		<div className="flex w-64 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-3">
			{rows.map((row) => {
				const isActive = row.presetId === selectedPresetId;
				return (
					<button
						key={row.presetId}
						type="button"
						onClick={() => onSelect(row.presetId)}
						aria-current={isActive ? "true" : undefined}
						className={cn(
							"flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
							isActive ? "bg-fill-selected" : "hover:bg-fill-hover",
						)}
					>
						<AgentIcon
							iconId={row.iconId}
							presetId={row.presetId}
							className="size-5"
						/>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-[13px] font-medium">
								{row.label}
							</span>
							<span className="block truncate text-[11px] text-muted-foreground">
								{row.fileCount > 0
									? `${row.fileCount} memory ${row.fileCount === 1 ? "file" : "files"}`
									: "No memory yet"}
							</span>
						</span>
					</button>
				);
			})}
		</div>
	);
}
