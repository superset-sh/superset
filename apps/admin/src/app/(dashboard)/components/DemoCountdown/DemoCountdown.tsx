"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const DEMO_DAY = new Date("2026-06-16T00:00:00");

function calculateDaysLeft(): number {
	const now = new Date();
	const diff = DEMO_DAY.getTime() - now.getTime();
	if (diff <= 0) return 0;
	return diff / (1000 * 60 * 60 * 24);
}

export function DemoCountdown() {
	const [daysLeft, setDaysLeft] = useState<number>(calculateDaysLeft);

	useEffect(() => {
		const timer = setInterval(() => {
			setDaysLeft(calculateDaysLeft());
		}, 100);

		return () => clearInterval(timer);
	}, []);

	const wholeDays = Math.floor(daysLeft);
	const fraction = (daysLeft - wholeDays).toFixed(6).slice(1); // ".466739"

	return (
		<div className="flex items-center justify-end gap-3">
			<Image src="/yc-logo.png" alt="Y Combinator" width={40} height={40} />
			<div className="flex items-baseline font-mono" suppressHydrationWarning>
				<span className="text-4xl font-bold">{wholeDays}</span>
				<span className="text-xl text-muted-foreground">{fraction}</span>
				<span className="ml-1 text-xl font-sans text-muted-foreground">
					days
				</span>
			</div>
		</div>
	);
}
