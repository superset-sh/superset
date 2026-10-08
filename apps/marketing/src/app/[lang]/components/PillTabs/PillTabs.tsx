"use client";

import type { ReactNode } from "react";

interface PillTabsProps<T extends string> {
	accent?: string;
	label: string;
	value: T | null;
	options: ReadonlyArray<{ id: T; label: string }>;
	onChange: (id: T) => void;
	children?: ReactNode;
}

export function PillTabs<T extends string>({
	accent,
	label,
	value,
	options,
	onChange,
	children,
}: PillTabsProps<T>) {
	return (
		<div
			className="flex flex-wrap items-center gap-2"
			role="tablist"
			aria-label={label}
		>
			{options.map((option) => {
				const active = option.id === value;
				return (
					<button
						key={option.id}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onChange(option.id)}
						className={`min-h-11 px-4 py-2 text-sm border rounded-[2px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
							active
								? accent
									? ""
									: "border-brand text-brand bg-brand/5"
								: "border-border text-muted-foreground hover:text-foreground"
						}`}
						style={
							active && accent
								? {
										borderColor: `rgba(${accent},0.5)`,
										color: `rgb(${accent})`,
										background: `rgba(${accent},0.06)`,
									}
								: undefined
						}
					>
						{option.label}
					</button>
				);
			})}
			{children}
		</div>
	);
}
