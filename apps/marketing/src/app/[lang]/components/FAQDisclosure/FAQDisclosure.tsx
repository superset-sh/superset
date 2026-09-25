import type { ReactNode } from "react";
import { HiPlus } from "react-icons/hi2";

export function FAQDisclosure({
	question,
	children,
	name,
	compact = false,
}: {
	question: ReactNode;
	children: ReactNode;
	name: string;
	compact?: boolean;
}) {
	return (
		<details
			name={name}
			className={`group border-b border-border ${compact ? "last:border-b-0" : ""}`}
		>
			<summary
				className={`flex w-full cursor-pointer list-none items-center justify-between text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring [&::-webkit-details-marker]:hidden ${compact ? "py-5" : "py-6"}`}
			>
				<span
					className={`font-medium text-foreground pr-4 ${compact ? "text-sm sm:text-base" : "text-base sm:text-lg"}`}
				>
					{question}
				</span>
				<HiPlus
					aria-hidden="true"
					className={`shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none group-open:rotate-45 ${compact ? "size-4" : "size-5"}`}
				/>
			</summary>
			<div
				className={`space-y-3 text-muted-foreground leading-relaxed ${compact ? "pb-5 pr-8 text-sm" : "pb-6 pr-12 text-base"}`}
			>
				{children}
			</div>
		</details>
	);
}
