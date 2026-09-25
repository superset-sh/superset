"use client";

import type { ReactNode } from "react";
import { scrollToElement } from "../../utils/scrollToElement";

interface GateJumpLinkProps {
	targetId: string;
	className?: string;
	title?: string;
	children: ReactNode;
}

/** Anchor that smooth-scrolls to a gate row and flashes it. */
export function GateJumpLink({
	targetId,
	className,
	title,
	children,
}: GateJumpLinkProps) {
	const jump = (event: React.MouseEvent) => {
		const el = document.getElementById(targetId);
		if (!el) return;
		event.preventDefault();
		scrollToElement(el, { center: true });
		el.classList.add("bg-brand/10");
		window.setTimeout(() => el.classList.remove("bg-brand/10"), 1600);
	};

	return (
		<a href={`#${targetId}`} onClick={jump} className={className} title={title}>
			{children}
		</a>
	);
}
