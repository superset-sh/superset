import { cn } from "@superset/ui/utils";
import { Check, Minus } from "lucide-react";
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

			<div className="overflow-x-auto">
				<table className="w-full min-w-[720px] border-collapse">
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
							<SectionGroup key={section.title} title={section.title}>
								{section.rows.map((row) => (
									<Row key={row.label} row={row} />
								))}
							</SectionGroup>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function SectionGroup({
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

function Row({ row }: { row: ComparisonRow }) {
	return (
		<tr className="border-b border-border/60">
			<td className="py-4 pr-4 text-sm text-foreground">
				<div className="flex items-center gap-2">
					<span>{row.label}</span>
					{row.comingSoon && <ComingSoonBadge />}
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

function ComingSoonBadge() {
	return (
		<span
			className={cn(
				"rounded-full bg-accent/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground",
			)}
		>
			Coming soon
		</span>
	);
}
