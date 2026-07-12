import type { ReactNode } from "react";

export function CellWithIcon({
	icon,
	label,
}: {
	icon: ReactNode;
	label: string;
}) {
	return (
		<span className="flex min-w-0 items-center gap-1.5" title={label}>
			{icon}
			<span className="truncate">{label}</span>
		</span>
	);
}
