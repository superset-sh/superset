"use client";

import { Badge } from "@superset/ui/badge";
import Link from "next/link";
import { type MouseEvent, type ReactNode, useRef, useState } from "react";

export interface IntegrationCardProps {
	id: string;
	name: string;
	description: string;
	category: string;
	icon: ReactNode;
	accentColor: string;
	disabled?: boolean;
}

export function IntegrationCard({
	id,
	name,
	description,
	category,
	icon,
	accentColor,
	disabled = false,
}: IntegrationCardProps) {
	const cardRef = useRef<HTMLDivElement>(null);
	const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
	const [isHovering, setIsHovering] = useState(false);

	const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
		if (!cardRef.current) return;
		const rect = cardRef.current.getBoundingClientRect();
		setMousePosition({
			x: e.clientX - rect.left,
			y: e.clientY - rect.top,
		});
	};

	const isActive = isHovering && !disabled;

	const card = (
		// biome-ignore lint/a11y/noStaticElementInteractions: Mouse events are for visual spotlight effect only
		<div
			ref={cardRef}
			onMouseMove={disabled ? undefined : handleMouseMove}
			onMouseEnter={disabled ? undefined : () => setIsHovering(true)}
			onMouseLeave={disabled ? undefined : () => setIsHovering(false)}
			className={`group relative flex h-[200px] flex-col items-center justify-between gap-3 overflow-hidden rounded-lg border p-4 transition-colors ${disabled ? "cursor-default opacity-50" : "cursor-pointer"}`}
			style={
				{
					"--accent-color": accentColor,
					"--accent-color-20": `${accentColor}33`,
					"--accent-color-50": `${accentColor}80`,
					"--mouse-x": `${mousePosition.x}px`,
					"--mouse-y": `${mousePosition.y}px`,
				} as React.CSSProperties
			}
		>
			{/* Spotlight effect */}
			{!disabled && (
				<div
					className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
					style={{
						background: isActive
							? `radial-gradient(560px circle at var(--mouse-x) var(--mouse-y), var(--accent-color-50), transparent 40%)`
							: "none",
					}}
				/>
			)}

			{/* Top: Category badge + Coming Soon */}
			<div className="relative z-10 flex w-full flex-row items-center justify-between">
				<Badge variant="secondary">{category}</Badge>
				{disabled && <Badge variant="outline">Coming Soon</Badge>}
			</div>

			{/* Middle: Icon + Name */}
			<div className="relative z-10 flex flex-col items-center gap-2">
				<div
					className={`flex size-14 items-center justify-center rounded-full border-2 p-2 transition-all duration-300 ${disabled ? "grayscale" : ""}`}
					style={{
						borderColor: isActive ? accentColor : `${accentColor}99`,
						boxShadow: isActive
							? `0 0 20px var(--accent-color-50), inset 0 0 15px var(--accent-color-20)`
							: `inset 0 0 10px var(--accent-color-20)`,
						backgroundColor: disabled ? "transparent" : `${accentColor}1a`,
					}}
				>
					{icon}
				</div>
				<strong className="text-base">{name}</strong>
			</div>

			{/* Bottom: Description */}
			<div className="relative z-10 h-[2.6em] w-full text-sm leading-[1.3em] text-muted-foreground">
				{description}
			</div>
		</div>
	);

	if (disabled) {
		return card;
	}

	return <Link href={`/integrations/${id}`}>{card}</Link>;
}
