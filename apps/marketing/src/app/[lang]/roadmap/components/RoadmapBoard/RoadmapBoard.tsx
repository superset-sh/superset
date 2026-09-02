"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import Image from "next/image";
import { useState } from "react";
import { PRBadge } from "@/app/[lang]/changelog/components/PRBadge";
import {
	CATEGORIES,
	CATEGORY_LABELS,
	ROADMAP_ITEMS,
	type RoadmapCategory,
	type RoadmapItem,
	type RoadmapStatus,
	STATUS_DESCRIPTIONS,
	STATUS_LABELS,
} from "../../data";

const COLUMNS: RoadmapStatus[] = ["now", "next", "later"];

const STATUS_DOT: Record<RoadmapStatus, string> = {
	now: "bg-emerald-500 animate-pulse",
	next: "bg-amber-500",
	later: "bg-muted-foreground/40",
	shipped: "bg-emerald-500",
};

type ShippedItem = RoadmapItem & { status: "shipped" };

function RoadmapCard({ item }: { item: RoadmapItem }) {
	const { t } = useLingui();

	return (
		<div className="group border border-border p-4 hover:border-foreground/20 transition-colors">
			<h3 className="text-sm font-medium text-foreground group-hover:text-foreground/80 transition-colors">
				{t(item.title)}
			</h3>
			<p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
				{t(item.description)}
			</p>
			<span className="text-[11px] font-mono text-muted-foreground mt-2 block uppercase tracking-wider">
				{t(CATEGORY_LABELS[item.category])}
			</span>
		</div>
	);
}

function ShippedHighlightCard({ item }: { item: ShippedItem }) {
	const { t } = useLingui();
	const body = (
		<>
			{item.image && (
				<div className="relative aspect-video overflow-hidden border-b border-border bg-muted/20">
					<Image
						src={item.image}
						alt={t(item.title)}
						fill
						sizes="(min-width: 768px) 33vw, 100vw"
						className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
					/>
				</div>
			)}
			<div className="flex-1 p-4">
				<div className="flex items-baseline justify-between gap-3">
					<h3 className="text-sm font-medium text-foreground group-hover:text-foreground/80 transition-colors">
						{t(item.title)}
					</h3>
					<span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">
						{item.shippedDate}
					</span>
				</div>
				<p className="text-xs text-muted-foreground mt-1.5">
					{t(item.description)}
				</p>
				{item.href ? (
					<span className="text-[11px] font-mono text-muted-foreground mt-2 block uppercase tracking-wider group-hover:text-foreground transition-colors">
						<Trans id="marketing.roadmap.readChangelog">
							Read the changelog →
						</Trans>
					</span>
				) : (
					item.pr && (
						<span className="mt-2 block">
							<PRBadge url={item.pr} />
						</span>
					)
				)}
			</div>
		</>
	);

	if (item.href) {
		return (
			<a
				href={item.href}
				className="group flex flex-col border border-border hover:border-foreground/20 transition-colors"
			>
				{body}
			</a>
		);
	}
	return (
		<div className="group flex flex-col border border-border hover:border-foreground/20 transition-colors">
			{body}
		</div>
	);
}

function ShippedCard({ item }: { item: ShippedItem }) {
	const { t } = useLingui();
	const body = (
		<>
			<div className="flex-1 min-w-0">
				<h3 className="flex items-center gap-2 text-sm font-medium text-foreground group-hover:text-foreground/80 transition-colors">
					{t(item.title)}
					{!item.href && item.pr && <PRBadge url={item.pr} />}
				</h3>
				<p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
					{t(item.description)}
				</p>
			</div>
			<span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap mt-0.5">
				{item.shippedDate}
			</span>
		</>
	);

	if (item.href) {
		return (
			<a
				href={item.href}
				className="group flex items-start gap-3 border border-border p-4 hover:border-foreground/20 transition-colors"
			>
				{body}
			</a>
		);
	}
	return (
		<div className="group flex items-start gap-3 border border-border p-4 hover:border-foreground/20 transition-colors">
			{body}
		</div>
	);
}

export function RoadmapBoard() {
	const { t } = useLingui();
	const [activeFilter, setActiveFilter] = useState<RoadmapCategory | null>(
		null,
	);

	const filtered = activeFilter
		? ROADMAP_ITEMS.filter((item) => item.category === activeFilter)
		: ROADMAP_ITEMS;

	const itemsFor = (status: RoadmapStatus) =>
		filtered.filter((item) => item.status === status);

	const shippedItems = filtered.filter(
		(item): item is ShippedItem => item.status === "shipped",
	);
	const shippedHighlights = shippedItems.filter((item) => item.image);
	const shippedRest = shippedItems.filter((item) => !item.image);

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
					<Trans id="marketing.roadmap.filter.all">All</Trans>
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
						{t(CATEGORY_LABELS[cat])}
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
								<h2 className="flex items-center gap-2 text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground">
									<span
										aria-hidden
										className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`}
									/>
									{t(STATUS_LABELS[status])}
									<span className="text-muted-foreground/50">
										{items.length}
									</span>
								</h2>
								<p className="text-[11px] text-muted-foreground/60 mt-1">
									{t(STATUS_DESCRIPTIONS[status])}
								</p>
							</div>

							{/* Cards */}
							<div className="flex flex-col">
								{items.map((item) => (
									<RoadmapCard key={item.id} item={item} />
								))}
								{items.length === 0 && (
									<p className="text-xs text-muted-foreground/40 px-4 py-8 text-center">
										<Trans id="marketing.roadmap.column.empty">No items</Trans>
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
					<div className="flex items-baseline justify-between mb-4">
						<h2 className="flex items-center gap-2 text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground">
							<span
								aria-hidden
								className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT.shipped}`}
							/>
							{t(STATUS_LABELS.shipped)}
							<span className="text-muted-foreground/50">
								{shippedItems.length}
							</span>
						</h2>
						<a
							href="/changelog"
							className="text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							<Trans id="marketing.roadmap.fullChangelog">
								Full changelog →
							</Trans>
						</a>
					</div>
					{shippedHighlights.length > 0 && (
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px mb-px">
							{shippedHighlights.map((item) => (
								<ShippedHighlightCard key={item.id} item={item} />
							))}
						</div>
					)}
					{shippedRest.length > 0 && (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-px">
							{shippedRest.map((item) => (
								<ShippedCard key={item.id} item={item} />
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
