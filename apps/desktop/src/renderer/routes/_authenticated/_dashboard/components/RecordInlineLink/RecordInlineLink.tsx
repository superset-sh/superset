import type { ReactNode } from "react";

interface RecordInlineLinkProps {
	icon: ReactNode;
	children: ReactNode;
	onClick: () => void;
}

export function RecordInlineLink({
	icon,
	children,
	onClick,
}: RecordInlineLinkProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="inline-flex max-w-[min(100%,480px)] items-center gap-1.5 rounded-sm px-1 py-0.5 align-bottom text-left font-medium text-foreground hover:bg-fill-hover focus-visible:bg-fill-hover focus-visible:outline-none"
		>
			<span className="flex shrink-0 items-center">{icon}</span>
			<span className="min-w-0 truncate">{children}</span>
		</button>
	);
}
