"use client";

export function WindowChrome() {
	return (
		<div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.03] px-5 py-3.5 backdrop-blur-md">
			<div className="flex items-center gap-1.5">
				<div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
				<div className="h-3 w-3 rounded-full bg-[#febc2e]" />
				<div className="h-3 w-3 rounded-full bg-[#28c840]" />
			</div>
			<span className="text-[12px] font-medium text-muted-foreground/55">
				superset
			</span>
			<div className="w-12" />
		</div>
	);
}
