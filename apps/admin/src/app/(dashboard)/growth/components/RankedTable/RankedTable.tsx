"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

export interface RankedColumn {
	key: string;
	label: ReactNode;
	align?: "left" | "right";
	className?: string;
}

export interface RankedRow {
	id: string;
	cells: Record<string, ReactNode>;
}

interface RankedTableProps {
	columns: RankedColumn[];
	rows: RankedRow[];
}

// A compact top-N list: first column is the thing, the rest are numbers.
export function RankedTable({ columns, rows }: RankedTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					{columns.map((column) => (
						<TableHead
							key={column.key}
							className={cn(
								"h-8 text-xs",
								column.align === "right" && "text-right",
								column.className,
							)}
						>
							{column.label}
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={row.id}>
						{columns.map((column) => (
							<TableCell
								key={column.key}
								className={cn(
									"py-1.5 text-sm",
									column.align === "right" && "text-right tabular-nums",
									column.className,
								)}
							>
								{row.cells[column.key]}
							</TableCell>
						))}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
