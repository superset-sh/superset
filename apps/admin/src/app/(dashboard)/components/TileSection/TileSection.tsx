"use client";

import type { ReactNode } from "react";

import { type GridTile, TileGrid } from "../TileGrid";

interface TileSectionProps {
	title: ReactNode;
	description: ReactNode;
	// Storage key for this section's tile arrangement.
	section: string;
	tiles: GridTile[];
}

export function TileSection({
	title,
	description,
	section,
	tiles,
}: TileSectionProps) {
	return (
		<section className="space-y-4">
			<div>
				<h2 className="text-lg font-semibold">{title}</h2>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>
			<TileGrid section={section} tiles={tiles} />
		</section>
	);
}
