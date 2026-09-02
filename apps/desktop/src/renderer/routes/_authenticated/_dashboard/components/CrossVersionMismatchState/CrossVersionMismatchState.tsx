import { Trans } from "@lingui/react/macro";
import { ArrowLeftFromLine } from "lucide-react";

export function CrossVersionMismatchState() {
	return (
		<div className="flex h-full w-full items-center justify-center p-6">
			<div className="flex w-full max-w-sm flex-col items-start gap-5">
				<ArrowLeftFromLine
					className="size-5 text-muted-foreground"
					strokeWidth={1.5}
					aria-hidden="true"
				/>
				<div className="flex flex-col gap-1.5">
					<h1 className="text-[15px] font-medium tracking-tight text-foreground select-text cursor-text">
						<Trans id="dashboard.crossVersionMismatchState.title">
							Pick a workspace
						</Trans>
					</h1>
					<p className="text-[13px] leading-relaxed text-muted-foreground select-text cursor-text">
						<Trans id="dashboard.crossVersionMismatchState.subtitle">
							Select a workspace from the sidebar to get started.
						</Trans>
					</p>
				</div>
			</div>
		</div>
	);
}
