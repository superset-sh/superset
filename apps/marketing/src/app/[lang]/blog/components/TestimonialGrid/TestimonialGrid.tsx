import type { ReactNode } from "react";

export function TestimonialGrid({ children }: { children: ReactNode }) {
	return (
		<div className="not-prose my-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
			{children}
		</div>
	);
}
