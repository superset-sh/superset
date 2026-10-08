import { ScrollArea } from "@superset/ui/scroll-area";
import type { ReactNode } from "react";
import type { PullRequestInfoVariant } from "../PullRequestInfo";

interface PullRequestPageBodyProps {
	header: ReactNode;
	/** The info in either shape: rows under the header in a narrow pane, a column in a wide one. */
	info: (variant: PullRequestInfoVariant) => ReactNode;
	children: ReactNode;
}

/**
 * The Summary body: the header, the info rail, and the description. The rail
 * is a right-hand column while the pane is wide and folds into rows under the
 * header when it is not; the switch is a container query on the body itself,
 * so a narrow window and a split pane fold it the same way.
 */
export function PullRequestPageBody({
	header,
	info,
	children,
}: PullRequestPageBodyProps) {
	return (
		<div className="@container/detail relative min-h-0 flex-1">
			<ScrollArea className="h-full [&>[data-slot=scroll-area-viewport]>div]:!block">
				<div className="mx-auto flex w-full max-w-[76rem] items-start gap-12 px-6 pt-4 pb-16 @max-[36rem]/detail:px-4 @max-[36rem]/detail:pt-3">
					<div className="min-w-0 flex-1">
						{header}
						<div className="mb-4 @min-[52rem]/detail:hidden">
							{info("rows")}
						</div>
						{children}
					</div>
					<aside className="sticky top-1 hidden w-[22rem] shrink-0 @min-[52rem]/detail:block">
						{info("column")}
					</aside>
				</div>
			</ScrollArea>
		</div>
	);
}
