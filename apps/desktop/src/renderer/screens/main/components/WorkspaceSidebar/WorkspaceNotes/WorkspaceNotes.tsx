import { cn } from "@superset/ui/utils";
import { useEffect, useRef, useState } from "react";
import { LuChevronRight, LuNotebookPen } from "react-icons/lu";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { STROKE_WIDTH } from "../constants";

interface WorkspaceNotesProps {
	workspaceId: string;
}

export function WorkspaceNotes({ workspaceId }: WorkspaceNotesProps) {
	const [isCollapsed, setIsCollapsed] = useState(false);
	const [localNotes, setLocalNotes] = useState<string | null>(null);
	// Track whether the user has made edits since load, to avoid writing
	// back the initial value fetched from the DB on first render.
	const isDirty = useRef(false);

	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId },
	);

	const setNotesMutation = electronTrpc.workspaces.setNotes.useMutation();

	// Seed local state from DB once on initial load
	useEffect(() => {
		if (workspace && localNotes === null) {
			setLocalNotes(workspace.notes ?? "");
		}
	}, [workspace, localNotes]);

	const debouncedNotes = useDebouncedValue(localNotes, 500);

	// Persist debounced edits to DB (only when the user has typed something)
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally omits setNotesMutation to avoid re-triggering
	useEffect(() => {
		if (!isDirty.current || debouncedNotes === null) return;
		setNotesMutation.mutate({ id: workspaceId, notes: debouncedNotes });
	}, [debouncedNotes, workspaceId]);

	if (localNotes === null) {
		return null;
	}

	return (
		<div className="border-t border-border">
			<div className="group text-[11px] uppercase tracking-wider text-muted-foreground/70 px-3 pt-3 pb-2 font-medium flex items-center gap-1.5 w-full hover:text-muted-foreground transition-colors">
				<button
					type="button"
					aria-expanded={!isCollapsed}
					onClick={() => setIsCollapsed((c) => !c)}
					className="flex items-center gap-1.5 focus-visible:text-muted-foreground focus-visible:outline-none"
				>
					<LuChevronRight
						className={cn(
							"size-3 transition-transform",
							!isCollapsed && "rotate-90",
						)}
						strokeWidth={STROKE_WIDTH}
					/>
					<LuNotebookPen className="size-3" strokeWidth={STROKE_WIDTH} />
					Notes
				</button>
			</div>

			{!isCollapsed && (
				<div className="px-3 pb-3">
					<textarea
						value={localNotes}
						onChange={(e) => {
							isDirty.current = true;
							setLocalNotes(e.target.value);
						}}
						placeholder="Add workspace notes..."
						className={cn(
							"w-full min-h-[80px] max-h-[200px] resize-y text-xs rounded-md",
							"bg-background/50 border border-border/50",
							"px-2 py-1.5 text-foreground placeholder:text-muted-foreground/50",
							"focus:outline-none focus:ring-1 focus:ring-ring focus:border-transparent",
							"leading-relaxed",
						)}
					/>
				</div>
			)}
		</div>
	);
}
