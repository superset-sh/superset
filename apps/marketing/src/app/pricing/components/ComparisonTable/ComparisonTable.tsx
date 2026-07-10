"use client";

import { cn } from "@superset/ui/utils";
import { Check, Minus } from "lucide-react";
import { useState } from "react";
import {
	COMPARISON_SECTIONS,
	type ComparisonRow,
	PRICING_TIERS,
} from "../../constants";

export function ComparisonTable() {
	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-col gap-3 text-center">
				<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
					Compare plans
				</span>
				<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground">
					All features, side by side
				</h2>
			</div>

			<DesktopTable />
			<MobileTable />
		</div>
	);
}

function DesktopTable() {
	return (
		<div className="hidden md:block">
			<table className="w-full table-fixed border-collapse">
				<thead>
					<tr className="border-b border-border">
						<th className="w-2/5 py-4 pr-4 text-left text-sm font-medium text-muted-foreground">
							Features
						</th>
						{PRICING_TIERS.map((tier) => (
							<th
								key={tier.id}
								className="w-1/5 py-4 px-4 text-left text-sm font-medium text-foreground"
							>
								{tier.name}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{COMPARISON_SECTIONS.map((section) => (
						<DesktopSectionGroup key={section.title} title={section.title}>
							{section.rows.map((row) => (
								<DesktopRow key={row.label} row={row} />
							))}
						</DesktopSectionGroup>
					))}
				</tbody>
			</table>
		</div>
	);
}

function DesktopSectionGroup({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<>
			<tr>
				<td
					colSpan={4}
					className="border-b border-border bg-accent/20 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground"
				>
					{title}
				</td>
			</tr>
			{children}
		</>
	);
}

function DesktopRow({ row }: { row: ComparisonRow }) {
	return (
		<tr className="border-b border-border/60">
			<td className="py-4 pr-4 text-sm text-foreground">
				<div className="flex items-center gap-2">
					<span>{row.label}</span>
					{row.badge && <RowBadge badge={row.badge} />}
				</div>
			</td>
			{row.values.map((value, index) => (
				<td
					key={`${row.label}-${index}`}
					className="px-4 py-4 text-sm text-foreground"
				>
					<Cell value={value} />
				</td>
			))}
		</tr>
	);
}

function MobileTable() {
	const [selectedIndex, setSelectedIndex] = useState(1);
	const selectedTier = PRICING_TIERS[selectedIndex];
	if (!selectedTier) return null;

	return (
		<div className="flex flex-col gap-6 md:hidden">
			<div className="inline-flex rounded-md border border-border bg-card p-1">
				{PRICING_TIERS.map((tier, index) => (
					<button
						key={tier.id}
						type="button"
						onClick={() => setSelectedIndex(index)}
						aria-pressed={index === selectedIndex}
						className={cn(
							"flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
							index === selectedIndex
								? "bg-foreground text-background"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{tier.name}
					</button>
				))}
			</div>

			<div className="flex flex-col gap-6">
				{COMPARISON_SECTIONS.map((section) => (
					<section key={section.title} className="flex flex-col">
						<p className="mb-1 rounded-md bg-accent/20 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{section.title}
						</p>
						<ul>
							{section.rows.map((row) => (
								<li
									key={row.label}
									className="flex items-center justify-between gap-3 border-b border-border/60 py-3 last:border-b-0"
								>
									<div className="flex items-center gap-2 text-sm text-foreground">
										<span>{row.label}</span>
										{row.badge && <RowBadge badge={row.badge} />}
									</div>
									<div className="shrink-0 text-sm text-foreground">
										<Cell value={row.values[selectedIndex] ?? null} />
									</div>
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</div>
	);
}

function Cell({ value }: { value: ComparisonRow["values"][number] }) {
	if (value === true) {
		return <Check className="size-4 text-foreground" aria-label="Included" />;
	}
	if (value === null || value === false) {
		return (
			<Minus
				className="size-4 text-muted-foreground"
				aria-label="Not included"
			/>
		);
	}
	return <span>{value}</span>;
}

function RowBadge({ badge }: { badge: NonNullable<ComparisonRow["badge"]> }) {
	const isPrimary = badge.variant === "default";
	return (
		<span
			className={cn(
				"rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
				isPrimary
					? "bg-foreground text-background"
					: "bg-accent/40 text-muted-foreground",
			)}
		>
			{badge.label}
		</span>
	);
}
