import { Button } from "@superset/ui/button";
import { useState } from "react";
import { ModelSelect } from "../../../ModelSelect";

/**
 * The reason this page exists: repoint N agents at a new model in two
 * clicks instead of editing N files.
 */
export function BulkModelBar({
	count,
	onApply,
	isApplying,
}: {
	count: number;
	onApply: (model: string | null) => void;
	isApplying: boolean;
}) {
	const [model, setModel] = useState<string | null>(null);

	return (
		<div className="border-t p-3 space-y-2 bg-background">
			<p className="text-xs text-muted-foreground">
				{count} agent{count === 1 ? "" : "s"} selected
			</p>
			<div className="flex items-center gap-2">
				<ModelSelect value={model} onChange={setModel} disabled={isApplying} />
			</div>
			<Button
				size="sm"
				className="w-full"
				disabled={isApplying || (model !== null && model.trim() === "")}
				onClick={() => onApply(model)}
			>
				{isApplying ? "Applying…" : "Set model"}
			</Button>
		</div>
	);
}
