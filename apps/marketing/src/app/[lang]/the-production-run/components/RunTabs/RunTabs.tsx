"use client";

import { type ReactNode, useState } from "react";
import { PillTabs } from "@/app/[lang]/components/PillTabs";
import { tierRgb } from "@/app/[lang]/components/TierBadge";
import type { ProductionRun, RunStatus } from "../../constants";
import { RunPanel } from "./components/RunPanel";

const OVERVIEW = "overview";

interface RunTabsProps {
	initialTab: string;
	runs: ProductionRun[];
	statuses: Record<string, RunStatus>;
	statusLabels: Record<string, string>;
	overview: ReactNode;
}

export function RunTabs({
	initialTab,
	runs,
	statuses,
	statusLabels,
	overview,
}: RunTabsProps) {
	const [active, setActive] = useState(initialTab);

	const select = (id: string) => {
		setActive(id);
		const run = runs.find((candidate) => candidate.id === id);
		const url = new URL(window.location.href);
		if (run) {
			url.searchParams.set("run", String(run.number));
		} else {
			url.searchParams.delete("run");
		}
		window.history.replaceState(null, "", url);
	};

	const options = [
		{ id: OVERVIEW, label: "Overview" },
		...runs.map((run) => ({ id: run.id, label: run.label })),
	];

	const run = runs.find((candidate) => candidate.id === active);

	return (
		<>
			<div className="border-b border-border">
				<div className="max-w-3xl mx-auto px-6 py-4">
					<PillTabs
						accent={tierRgb(2)}
						label="Production run"
						value={active}
						options={options}
						onChange={select}
					/>
				</div>
			</div>

			{run ? (
				<section className="relative border-b border-border">
					<div className="max-w-3xl mx-auto px-6 py-16 relative">
						<RunPanel
							run={run}
							status={statuses[run.id] ?? "upcoming"}
							statusLabel={statusLabels[run.id] ?? ""}
						/>
					</div>
				</section>
			) : (
				overview
			)}
		</>
	);
}
