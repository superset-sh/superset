const AGENTS = [
	"Amp",
	"Mastracode",
	"OpenCode",
	"Pi",
	"Mistral Vibe",
	"Cursor Agent",
	"Droid",
	"Polygraph",
] as const;

export function NoDataStrip() {
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
			<span className="flex items-center gap-1">
				<span aria-hidden>○</span> No data yet
			</span>
			{AGENTS.map((agent) => (
				<span
					key={agent}
					className="flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5"
				>
					<span aria-hidden>◦</span>
					{agent}
				</span>
			))}
		</div>
	);
}
