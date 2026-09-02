// Code-drawn phone for the "coming soon" card. The app is not on the App Store
// yet, so a real capture would be a screenshot of something nobody can install.
const SESSIONS: readonly { title: string; meta: string; age: string }[] = [
	{ title: "Add user authentication flow", meta: "Claude · +340", age: "10h" },
	{ title: "Fix onboarding crash", meta: "Codex · +46 −1", age: "1d" },
	{ title: "Add dark mode toggle", meta: "Claude · +156 −34", age: "14d" },
];

export function MobileMock() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none flex h-full w-full select-none items-end justify-center overflow-hidden pt-2"
		>
			{/* Phone body, cropped by the card band so it reads as a device sitting
			    in frame rather than a floating rectangle */}
			<div className="w-[66%] min-w-[150px] rounded-t-[20px] border border-border border-b-0 bg-background p-4 shadow-[0_-1px_0_rgba(255,255,255,0.04)]">
				<div className="flex items-center justify-between">
					<span className="font-mono text-[9px] text-foreground tracking-wider">
						SUPERSET
					</span>
					<span className="rounded-[2px] border border-border px-1.5 py-0.5 font-mono text-[7px] text-muted-foreground">
						Superset
					</span>
				</div>

				<div className="mt-3 font-mono text-[7px] text-muted-foreground uppercase tracking-wider">
					Workspace
				</div>
				<div className="font-medium text-[12px] text-foreground">
					Superset Main
				</div>

				<div className="mt-3 space-y-2.5">
					{SESSIONS.map((session) => (
						<div key={session.title} className="flex items-start gap-2">
							<span className="mt-[5px] size-1.5 shrink-0 rounded-full bg-brand" />
							<span className="min-w-0 flex-1">
								<span className="block truncate text-[10px] text-foreground">
									{session.title}
								</span>
								<span className="block truncate font-mono text-[7px] text-muted-foreground">
									{session.meta}
								</span>
							</span>
							<span className="shrink-0 font-mono text-[7px] text-muted-foreground">
								{session.age}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
