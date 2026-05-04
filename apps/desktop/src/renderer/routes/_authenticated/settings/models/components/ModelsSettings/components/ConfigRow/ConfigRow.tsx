import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface ConfigRowProps {
	title: string;
	description?: string;
	htmlFor?: string;
	field: ReactNode;
	isActive?: boolean;
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
	isActive,
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
		<div
			className={cn("flex items-start justify-between gap-6 py-2.5", className)}
		>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<Label htmlFor={htmlFor} className="text-sm font-medium">
						{title}
					</Label>
					{isActive ? (
						<Badge variant="secondary" className="text-[10px] h-4 px-1.5">
							Active
						</Badge>
					) : null}
				</div>
				{description ? (
					<p className="text-xs text-muted-foreground mt-0.5">{description}</p>
				) : null}
			</div>
			<div className="w-80 shrink-0 flex items-center gap-2">
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
