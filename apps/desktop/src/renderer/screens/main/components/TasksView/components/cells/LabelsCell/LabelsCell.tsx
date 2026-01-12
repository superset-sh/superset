import type { SelectTask } from "@superset/db/schema";
import { Badge } from "@superset/ui/badge";
import type { CellContext } from "@tanstack/react-table";

interface LabelsCellProps {
	info: CellContext<SelectTask, string[] | null>;
}

export function LabelsCell({ info }: LabelsCellProps) {
	const currentLabels = info.getValue() || [];

	// Don't render anything if there are no labels
	if (currentLabels.length === 0) {
		return null;
	}

	return (
		<div className="flex gap-1 flex-shrink-0">
			{currentLabels.slice(0, 2).map((label) => (
				<Badge key={label} variant="outline" className="text-xs">
					{label}
				</Badge>
			))}
			{currentLabels.length > 2 && (
				<Badge variant="outline" className="text-xs">
					+{currentLabels.length - 2}
				</Badge>
			)}
		</div>
	);
}
