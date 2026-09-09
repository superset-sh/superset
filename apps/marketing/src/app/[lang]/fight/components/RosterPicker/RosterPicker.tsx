"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSearch } from "@/app/[lang]/utils/fetchLeaderboard";
import { HOUSE_FIGHTERS } from "../../constants";
import type { Fighter } from "../../utils/simulateFight";
import { fromStandingRow } from "../../utils/toFighter";
import { RosterCard } from "./components/RosterCard";

const DEBOUNCE_MS = 220;
const MAX_CARDS = 8;

interface RosterPickerProps {
	seated: Array<string | undefined>;
	onPick: (fighter: Fighter) => void;
}

export function RosterPicker({ seated, onPick }: RosterPickerProps) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<Fighter[]>([]);
	const [busy, setBusy] = useState(false);
	const abort = useRef<AbortController | null>(null);

	useEffect(() => {
		const term = query.trim();
		if (!term) {
			setResults([]);
			setBusy(false);
			return;
		}

		setBusy(true);
		const timer = setTimeout(() => {
			abort.current?.abort();
			const controller = new AbortController();
			abort.current = controller;
			fetchSearch(term, { period: "all" }, controller.signal).then((rows) => {
				if (controller.signal.aborted) return;
				setResults(rows.map(fromStandingRow));
				setBusy(false);
			});
		}, DEBOUNCE_MS);

		return () => {
			clearTimeout(timer);
			abort.current?.abort();
		};
	}, [query]);

	useEffect(() => () => abort.current?.abort(), []);

	const searching = query.trim().length > 0;
	const roster = (searching ? results : HOUSE_FIGHTERS).slice(0, MAX_CARDS);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-4">
				<span className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-muted-foreground">
					{searching ? "leaderboard" : "the regulars"}
				</span>
				<div className="relative w-full max-w-[15rem]">
					<span
						aria-hidden="true"
						className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[0.7rem] text-muted-foreground/60"
					>
						⌕
					</span>
					<input
						type="text"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search a developer"
						aria-label="Search the leaderboard for a fighter"
						className="w-full border border-border bg-transparent pl-8 pr-8 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.1em] text-foreground placeholder:text-muted-foreground/50 placeholder:normal-case focus:outline-none focus:border-brand/60 transition-colors"
					/>
					{busy && (
						<span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[0.7rem] text-muted-foreground/60">
							…
						</span>
					)}
				</div>
			</div>

			{roster.length === 0 ? (
				<p className="border border-border/60 py-8 text-center font-mono text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">
					{searching ? "nobody here by that name" : "no fighters available"}
				</p>
			) : (
				<div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
					{roster.map((fighter) => (
						<RosterCard
							key={fighter.handle}
							fighter={fighter}
							seated={seated.includes(fighter.handle)}
							onPick={onPick}
						/>
					))}
				</div>
			)}
		</div>
	);
}
