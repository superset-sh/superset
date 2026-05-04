import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface ConfigRowProps {
	title: string;
	description?: string;
	htmlFor?: string;
	field: ReactNode;
	onSave?: () => void;
	onClear?: () => void;
	saveLabel?: string;
	clearLabel?: string;
	showSave?: boolean;
	showClear?: boolean;
	disableSave?: boolean;
	disableClear?: boolean;
	className?: string;
}

export function ConfigRow({
	title,
	description,
	htmlFor,
	field,
	onSave,
	onClear,
	saveLabel = "Save",
	clearLabel = "Clear",
	showSave = true,
	showClear = true,
	disableSave,
	disableClear,
	className,
}: ConfigRowProps) {
	return (
		<div className={cn("space-y-1.5", className)}>
			<Label htmlFor={htmlFor} className="text-sm font-medium">
				{title}
			</Label>
			{description ? (
				<p className="text-xs text-muted-foreground -mt-1">{description}</p>
			) : null}
			<div className="flex items-center gap-2">
				<div className="min-w-0 flex-1">{field}</div>
				{onClear && showClear ? (
					<Button
						variant="outline"
						size="sm"
						onClick={onClear}
						disabled={disableClear}
					>
						{clearLabel}
					</Button>
				) : null}
				{onSave && showSave ? (
					<Button size="sm" onClick={onSave} disabled={disableSave}>
						{saveLabel}
					</Button>
				) : null}
			</div>
		</div>
	);
}
