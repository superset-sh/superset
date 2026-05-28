import { Label } from "@superset/ui/label";
import type { ReactNode } from "react";

interface SettingsRowProps {
	label: string;
	hint?: ReactNode;
	htmlFor?: string;
	children: ReactNode;
}

export function SettingsRow({
	label,
	hint,
	htmlFor,
	children,
}: SettingsRowProps) {
	return (
		<div className="flex items-center justify-between gap-8 py-2.5">
			<div className="min-w-0 flex-1">
				<Label htmlFor={htmlFor} className="text-sm font-medium">
					{label}
				</Label>
				{hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}
