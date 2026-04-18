import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface ConfigRowProps {
	title: string;
	description?: string;
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
		<div className={cn("px-4 py-4", className)}>
			<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
				<div className="min-w-0 lg:w-64">
					<p className="text-sm font-semibold">{title}</p>
					{description ? (
						<p className="mt-1 text-sm text-muted-foreground">{description}</p>
					) : null}
				</div>
				<div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center">
					<div className="min-w-0 flex-1">{field}</div>
					<div className="flex shrink-0 items-center gap-2 self-end lg:self-auto">
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
			</div>
		</div>
	);
}
