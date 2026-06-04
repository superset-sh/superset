"use client";

import { useState } from "react";
import {
	CATEGORIES,
	ROADMAP_ITEMS,
	type RoadmapCategory,
	type RoadmapItem,
	type RoadmapStatus,
	STATUS_LABELS,
} from "../../data";

const COLUMNS: RoadmapStatus[] = ["now", "next", "later"];

function RoadmapCard({ item }: { item: RoadmapItem }) {
	return (
		<div className="group border border-border p-4 hover:border-foreground/20 transition-colors">
			<h3 className="text-sm font-medium text-foreground group-hover:text-foreground/80 transition-colors">
				{item.title}
			</h3>
			<p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
				{item.description}
			</p>
			<span className="text-[11px] font-mono text-muted-foreground mt-2 block uppercase tracking-wider">
				{item.category}
			</span>
		</div>
	);
}

function ShippedCard({ item }: { item: RoadmapItem & { status: "shipped" } }) {
	return (
		<div className="group flex items-start gap-3 border border-border p-4 hover:border-foreground/20 transition-colors">
			<div className="flex-1 min-w-0">
				<h3 className="text-sm font-medium text-foreground group-hover:text-foreground/80 transition-colors">
					{item.title}
				</h3>
				<p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
					{item.description}
				</p>
			</div>
			<span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap mt-0.5">
				{item.shippedDate}
			</span>
		</div>
	);
}

export function RoadmapBoard() {
	const [activeFilter, setActiveFilter] = useState<RoadmapCategory | null>(
		null,
	);

	const filtered = activeFilter
		? ROADMAP_ITEMS.filter((item) => item.category === activeFilter)
		: ROADMAP_ITEMS;

	const itemsFor = (status: RoadmapStatus) =>
		filtered.filter((item) => item.status === status);

	const shippedItems = filtered.filter((item) => item.status === "shipped");

	return (
		<div>
			{/* Category filters */}
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-8">
				<button
					type="button"
					onClick={() => setActiveFilter(null)}
					className={`text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 ${
						activeFilter === null
							? "text-foreground"
							: "text-muted-foreground hover:text-foreground"
					}`}
				>
					All
				</button>
				<div className="h-4 w-px bg-border" />
				{CATEGORIES.map((cat) => (
					<button
						type="button"
						key={cat}
						onClick={() => setActiveFilter(activeFilter === cat ? null : cat)}
						className={`text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50 ${
							activeFilter === cat
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{cat}
					</button>
				))}
			</div>

			{/* Kanban columns */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-px md:gap-0 md:border md:border-border">
				{COLUMNS.map((status, colIdx) => {
					const items = itemsFor(status);
					return (
						<div
							key={status}
							className={`min-h-[200px] ${colIdx < COLUMNS.length - 1 ? "md:border-r md:border-border" : ""}`}
						>
							{/* Column header */}
							<div className="border-b border-border px-4 py-3">
								<h2 className="text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground">
									{STATUS_LABELS[status]}
									<span className="ml-2 text-muted-foreground/50">
										{items.length}
									</span>
								</h2>
							</div>

							{/* Cards */}
							<div className="flex flex-col">
								{items.map((item) => (
									<RoadmapCard key={item.id} item={item} />
								))}
								{items.length === 0 && (
									<p className="text-xs text-muted-foreground/40 px-4 py-8 text-center">
										No items
									</p>
								)}
							</div>
						</div>
					);
				})}
			</div>

			{/* Shipped section */}
			{shippedItems.length > 0 && (
				<div className="mt-12">
					<h2 className="text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground mb-4">
						{STATUS_LABELS.shipped}
						<span className="ml-2 text-muted-foreground/50">
							{shippedItems.length}
						</span>
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-px">
						{shippedItems.map((item) => (
							<ShippedCard key={item.id} item={item} />
						))}
					</div>
				</div>
			)}
		</div>
	);
}
