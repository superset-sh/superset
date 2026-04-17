import { Button } from "@superset/ui/button";
import type { ViewProps } from "../../types";

export function BinaryWarningView({ filePath, onForceView }: ViewProps) {
	const name = filePath.split(/[/\\]/).pop() ?? filePath;

	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
			<div className="text-sm font-medium">{name}</div>
			<div className="max-w-md text-xs text-muted-foreground">
				This looks like a binary file. Opening it as text may show garbled
				output or freeze the editor for large files.
			</div>
			<Button variant="outline" size="sm" onClick={() => onForceView("code")}>
				Open Anyway
			</Button>
		</div>
	);
}
