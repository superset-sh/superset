"use client";

import type { ReactNode } from "react";

export interface Stat {
	label: ReactNode;
	value: ReactNode;
	hint?: ReactNode;
}

export function StatStrip({ stats }: { stats: Stat[] }) {
	return (
		<dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
			{stats.map((stat, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: stats are positional
				<div key={i} className="min-w-0">
					<dt className="text-muted-foreground truncate text-xs">
						{stat.label}
					</dt>
					<dd className="text-xl font-semibold tabular-nums">{stat.value}</dd>
					{stat.hint ? (
						<dd className="text-muted-foreground text-xs">{stat.hint}</dd>
					) : null}
				</div>
			))}
		</dl>
	);
}
