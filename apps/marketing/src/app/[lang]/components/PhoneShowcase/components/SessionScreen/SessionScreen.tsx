import {
	HiMiniChevronLeft,
	HiMiniMicrophone,
	HiMiniPlus,
} from "react-icons/hi2";

const KEYS = ["esc", "↵", "tab", "↑", "↓", "^C"] as const;

export function SessionScreen() {
	return (
		<div className="flex min-h-0 flex-1 flex-col px-3 pt-2 pb-4">
			<div className="flex items-center gap-2">
				<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10">
					<HiMiniChevronLeft className="size-3.5" />
				</span>
				<span className="truncate font-semibold text-[11px]">
					Fix input overflow handling
				</span>
			</div>

			<div className="mt-3 min-h-0 flex-1 space-y-2.5 overflow-hidden font-mono text-[8.5px] text-white/85 leading-[1.45]">
				<p className="bg-white/10 px-1.5 py-1 text-white">
					› Cap long queries in the command bar and add tests.
				</p>
				<p>
					<span className="text-brand-light">●</span> Reading{" "}
					<span className="text-indigo-300">normalizeQuery.ts</span>
				</p>
				<p>
					<span className="text-brand-light">●</span>{" "}
					<span className="font-bold">Two changes.</span> Cap the query at{" "}
					<span className="text-indigo-300">MAX_QUERY_LENGTH</span> and return{" "}
					<span className="text-indigo-300">didOverflow</span> so callers can
					show a hint.
				</p>
				<p>
					<span className="text-brand-light">●</span> Run{" "}
					<span className="text-indigo-300">npm test</span>
					<br />
					<span className="text-emerald-400">✔ 14 passed</span>
				</p>
				<p className="text-white/45">✻ Worked for 55s · done 4:57 AM</p>
				<p className="border-white/15 border-y py-1 text-white/45">
					› open a PR for this
				</p>
			</div>

			<div className="mt-2 flex items-center justify-between rounded-full bg-white/10 px-2.5 py-1.5 font-mono text-[8px] text-white/70">
				{KEYS.map((key) => (
					<span key={key}>{key}</span>
				))}
			</div>
			<div className="mt-2 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1.5">
				<span className="flex size-5 items-center justify-center rounded-full bg-white/10">
					<HiMiniPlus className="size-3" />
				</span>
				<span className="flex-1 text-[10px] text-white/45">
					Type a message…
				</span>
				<HiMiniMicrophone className="size-3 text-white/50" />
			</div>
		</div>
	);
}
