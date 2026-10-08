import type { ReactNode } from "react";

export function StepFrame({ children }: { children: ReactNode }) {
	return (
		<div
			aria-hidden="true"
			className="relative flex h-64 items-center justify-center overflow-hidden border border-border bg-card/40 p-6"
		>
			{children}
		</div>
	);
}
