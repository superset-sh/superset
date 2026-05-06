import type { ReactNode } from "react";

export function CellWithIcon({
	icon,
	label,
}: {
	icon: ReactNode;
	label: string;
}) {
	return (
		<span className="inline-flex items-center gap-1.5">
			{icon}
			<span className="truncate">{label}</span>
		</span>
	);
}
