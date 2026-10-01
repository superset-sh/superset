import type { ReactNode } from "react";
import { PageHeader } from "../PageHeader";
import { WindowChromeScope } from "../WindowChromeScope";

interface RecordLayoutProps {
	header: ReactNode;
	headerEnd?: ReactNode;
	/** The side column's heading, when its first section is named. */
	sideTitle?: ReactNode;
	/** Narrow windows keep them on the main header's row. */
	sideActions?: ReactNode;
	side: ReactNode;
	children: ReactNode;
}

export function RecordLayout({
	header,
	headerEnd,
	sideTitle,
	sideActions,
	side,
	children,
}: RecordLayoutProps) {
	return (
		<div className="@container flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
			<div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto] content-start overflow-auto [grid-template-areas:'header_side-header'_'main_main'_'side_side'] @min-[900px]:grid-cols-[minmax(0,1fr)_372px] @min-[900px]:grid-rows-[auto_minmax(0,1fr)] @min-[900px]:content-stretch @min-[900px]:overflow-hidden @min-[900px]:[grid-template-areas:'header_side-header'_'main_side']">
				<PageHeader
					start={header}
					end={headerEnd}
					reservesWindowControls={false}
					className="sticky top-0 z-10 min-w-0 bg-background text-[13px] [grid-area:header]"
				/>
				<WindowChromeScope enabled={false}>
					<PageHeader
						className="sticky top-0 z-10 min-w-0 bg-background [grid-area:side-header] @min-[900px]:border-l @min-[900px]:border-border"
						contentClassName={sideTitle ? "pl-5" : "pl-0"}
					>
						{sideTitle && (
							<span className="hidden shrink-0 text-[10px] font-medium tracking-wide text-muted-foreground uppercase @min-[900px]:inline">
								{sideTitle}
							</span>
						)}
						<div className="@container/record-actions flex h-full min-w-0 flex-1 items-center justify-end gap-3">
							<div className="drag h-full min-w-0 flex-1" />
							{sideActions}
						</div>
					</PageHeader>
				</WindowChromeScope>
				<main className="min-w-0 pt-5 pr-10 pb-10 pl-8 [grid-area:main] @min-[900px]:overflow-auto">
					{children}
				</main>
				<div className="min-w-0 border-t border-border [grid-area:side] @min-[900px]:overflow-auto @min-[900px]:border-t-0 @min-[900px]:border-l">
					{side}
				</div>
			</div>
		</div>
	);
}
