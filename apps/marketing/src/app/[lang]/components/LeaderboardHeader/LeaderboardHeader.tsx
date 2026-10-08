import type { ReactNode } from "react";
export function LeaderboardHeader({
	title,
	description,
	actions,
	navigation,
}: {
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	navigation?: ReactNode;
}) {
	return (
		<header className="space-y-5">
			<div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
				<div className="max-w-xl min-w-0">
					<h1 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
						{title}
					</h1>
					{description && (
						<div className="mt-3 text-sm leading-relaxed text-muted-foreground">
							{description}
						</div>
					)}
				</div>
				{actions}
			</div>
			{navigation && (
				<div className="flex flex-wrap items-center gap-x-6">{navigation}</div>
			)}
		</header>
	);
}
