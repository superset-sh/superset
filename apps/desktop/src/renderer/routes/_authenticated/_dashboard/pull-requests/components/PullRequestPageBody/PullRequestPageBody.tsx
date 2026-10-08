import { ScrollArea } from "@superset/ui/scroll-area";
import { type ReactNode, useRef } from "react";
import type { PullRequestInfoVariant } from "../PullRequestInfo";
import { usePullRequestInfoVariant } from "./hooks/usePullRequestInfoVariant";

interface PullRequestPageBodyProps {
	header: ReactNode;
	/** The info in either shape: rows under the header in a narrow pane, a column in a wide one. */
	info: (variant: PullRequestInfoVariant) => ReactNode;
	/** Rendered once: under the info column in a wide pane, after the content in a narrow one. */
	aside?: ReactNode;
	children: ReactNode;
}

/**
 * The Summary body: the header, the info rail, and the description. The rail
 * is a right-hand column while the pane is wide and folds into rows under the
 * header when it is not; the switch measures the body itself, so a narrow
 * window and a split pane fold it the same way.
 */
export function PullRequestPageBody({
	header,
	info,
	aside,
	children,
}: PullRequestPageBodyProps) {
	const bodyRef = useRef<HTMLDivElement>(null);
	const variant = usePullRequestInfoVariant(bodyRef);

	return (
		<div ref={bodyRef} className="@container/detail relative min-h-0 flex-1">
			<ScrollArea className="h-full [&>[data-slot=scroll-area-viewport]>div]:!block">
				<div className="mx-auto flex w-full max-w-[76rem] items-start gap-12 px-6 pt-4 pb-16 @max-[36rem]/detail:px-4 @max-[36rem]/detail:pt-3">
					<div className="min-w-0 flex-1">
						{header}
						{variant === "rows" ? (
							<div className="mb-4">{info("rows")}</div>
						) : null}
						{children}
						{variant === "rows" && aside ? (
							<div className="mt-6">{aside}</div>
						) : null}
					</div>
					{variant === "column" ? (
						<aside className="sticky top-1 w-[22rem] shrink-0 space-y-6">
							{info("column")}
							{aside}
						</aside>
					) : null}
				</div>
			</ScrollArea>
		</div>
	);
}
