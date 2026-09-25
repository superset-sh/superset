import {
	HiMiniCheckCircle,
	HiMiniChevronLeft,
	HiMiniChevronRight,
	HiMiniEllipsisHorizontal,
} from "react-icons/hi2";

const DIFF: readonly { sign: " " | "+" | "-"; code: string }[] = [
	{ sign: " ", code: "export function normalizeQuery(q) {" },
	{ sign: "-", code: "  return q.trim();" },
	{ sign: "+", code: "  const next = q.trim();" },
	{ sign: "+", code: "  return next.slice(0, MAX);" },
	{ sign: " ", code: "}" },
];

const DIFF_LINE_CLASS = {
	" ": "text-white/55",
	"+": "bg-emerald-400/10 text-emerald-300",
	"-": "bg-red-400/10 text-red-300",
} as const;

export function ReviewScreen() {
	return (
		<div className="flex min-h-0 flex-1 flex-col px-4 pt-2 pb-4">
			<div className="flex items-center justify-between">
				<span className="flex size-7 items-center justify-center rounded-full bg-white/10">
					<HiMiniChevronLeft className="size-3.5" />
				</span>
				<span className="flex size-7 items-center justify-center rounded-full bg-white/10">
					<HiMiniEllipsisHorizontal className="size-3.5" />
				</span>
			</div>

			<div className="mt-3 flex items-center gap-1.5 text-[9px]">
				<span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 font-semibold text-emerald-400">
					Open
				</span>
				<span className="text-emerald-400">+26</span>
				<span className="text-red-400">−2</span>
				<span className="text-white/45">· 2 files</span>
			</div>
			<div className="mt-1.5 font-semibold text-[12px] leading-snug">
				Fix input overflow handling in the command bar{" "}
				<span className="text-white/40">#1</span>
			</div>

			<div className="mt-3 rounded-xl border border-white/10 p-2.5">
				<div className="font-semibold text-[10px]">Waiting for review</div>
				<div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
					<HiMiniCheckCircle className="size-3.5 text-emerald-400" />
					All checks passed
				</div>
			</div>

			<div className="mt-3 text-[9px] text-white/45">src/normalizeQuery.ts</div>
			<div className="mt-1.5 overflow-hidden rounded-lg border border-white/10 py-1 font-mono text-[8px] leading-[1.7]">
				{DIFF.map((line) => (
					<div
						key={line.sign + line.code}
						className={`flex gap-1.5 whitespace-pre px-2 ${DIFF_LINE_CLASS[line.sign]}`}
					>
						<span className="w-1.5 shrink-0">{line.sign}</span>
						<span className="truncate">{line.code}</span>
					</div>
				))}
			</div>

			<div className="mt-auto flex items-center justify-between rounded-xl border border-white/10 px-2.5 py-2 text-[10px]">
				2 files changed
				<HiMiniChevronRight className="size-3 text-white/50" />
			</div>
		</div>
	);
}
