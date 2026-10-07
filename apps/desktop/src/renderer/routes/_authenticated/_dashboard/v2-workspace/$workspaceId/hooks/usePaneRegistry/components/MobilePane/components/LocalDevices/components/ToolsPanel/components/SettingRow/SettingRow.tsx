import { Label } from "@superset/ui/label";
import type { ReactNode } from "react";

interface SettingRowProps {
	icon: ReactNode;
	label: string;
	children: ReactNode;
}

export function SettingRow({ icon, label, children }: SettingRowProps) {
	return (
		<div className="flex min-h-7 items-center justify-between gap-3">
			<Label className="shrink-0 gap-2 text-xs font-normal">
				<span className="flex size-4 items-center justify-center text-muted-foreground">
					{icon}
				</span>
				{label}
			</Label>
			<span className="flex min-w-0 justify-end">{children}</span>
		</div>
	);
}
