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

const SECTIONS: RoadmapStatus[] = ["now", "next", "later"];

function RoadmapCard({ item }: { item: RoadmapItem }) {
	return (
		<div className="group border border-border p-5 hover:border-foreground/20 transition-colors">
			<h3 className="text-base font-medium text-foreground group-hover:text-foreground/80 transition-colors">
				{item.title}
			</h3>
			<p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
				{item.description}
			</p>
			<span className="text-xs font-mono text-muted-foreground mt-3 block uppercase tracking-wider">
				{item.category}
			</span>
		</div>
	);
}

function ShippedCard({ item }: { item: RoadmapItem }) {
	return (
		<div className="group border border-border p-5 hover:border-foreground/20 transition-colors">
			<div className="flex items-baseline justify-between gap-4">
				<h3 className="text-base font-medium text-foreground group-hover:text-foreground/80 transition-colors">
					{item.title}
				</h3>
				{item.shippedDate && (
					<span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
						{item.shippedDate}
					</span>
				)}
			</div>
			<p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
				{item.description}
			</p>
			<span className="text-xs font-mono text-muted-foreground mt-3 block uppercase tracking-wider">
				{item.category}
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
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-10">
				<button
					type="button"
					onClick={() => setActiveFilter(null)}
					className={`text-sm transition-colors ${
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
						className={`text-sm transition-colors ${
							activeFilter === cat
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{cat}
					</button>
				))}
			</div>

			{/* Sections */}
			{SECTIONS.map((status) => {
				const items = itemsFor(status);
				if (items.length === 0 && activeFilter) return null;
				return (
					<section key={status} className="mb-12 last:mb-0">
						<h2 className="text-xl font-medium text-foreground mb-6">
							{STATUS_LABELS[status]}
						</h2>
						<div className="flex flex-col gap-4">
							{items.map((item) => (
								<RoadmapCard key={item.id} item={item} />
							))}
						</div>
					</section>
				);
			})}

			{/* Shipped section */}
			{shippedItems.length > 0 && (
				<div className="border-t border-border mt-12 pt-12">
					<h2 className="text-xl font-medium text-foreground mb-6">
						{STATUS_LABELS.shipped}
					</h2>
					<div className="flex flex-col gap-4">
						{shippedItems.map((item) => (
							<ShippedCard key={item.id} item={item} />
						))}
					</div>
				</div>
			)}
		</div>
	);
}
