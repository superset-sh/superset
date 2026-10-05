import type { ReactNode } from "react";

export function SubmenuValue({ children }: { children: ReactNode }) {
	return (
		<span className="ml-auto max-w-[8rem] truncate pl-3 text-xs text-muted-foreground">
			{children}
		</span>
	);
}
