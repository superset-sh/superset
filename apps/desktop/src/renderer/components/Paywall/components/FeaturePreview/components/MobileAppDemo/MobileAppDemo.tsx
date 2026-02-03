function SupersetIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 86 66"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className={className}
			aria-hidden="true"
		>
			{/* Left bracket {[ */}
			<path
				d="M22 0H33V11H22V0ZM11 0H22V11H11V0ZM11 11H22V22H11V11ZM0 22H11V33H0V22ZM0 33H11V44H0V33ZM11 44H22V55H11V44ZM11 55H22V66H11V55ZM22 55H33V66H22V55Z"
				fill="currentColor"
			/>
			{/* Right bracket ]} */}
			<path
				d="M53 0H64V11H53V0ZM64 11H75V22H64V11ZM75 22H86V33H75V22ZM64 44H75V55H64V44ZM53 55H64V66H53V55ZM75 33H86V44H75V33ZM64 55H75V66H64V55ZM64 0H75V11H64V0Z"
				fill="currentColor"
			/>
		</svg>
	);
}

const CHAT_MESSAGES = [
	{
		id: "1",
		role: "user",
		content: "Can you add dark mode to the settings page?",
	},
	{
		id: "2",
		role: "assistant",
		content:
			"I'll add a dark mode toggle to the settings. Let me update the theme context and add the UI switch.",
	},
	{
		id: "3",
		role: "assistant",
		content:
			"Done! I've added:\n• Theme toggle in settings\n• Dark/light mode support\n• System preference detection",
		isLatest: true,
	},
];

export function MobileAppDemo() {
	return (
		<div className="relative w-full h-full overflow-hidden">
			{/* Phone frame - large and cropped at bottom */}
			<div className="absolute right-12 top-10 w-[340px] h-[700px] bg-black rounded-[50px] border-[8px] border-neutral-700 shadow-2xl overflow-hidden">
				{/* Dynamic Island */}
				<div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-8 bg-black rounded-full z-10" />

				{/* Screen content */}
				<div className="absolute inset-2 bg-card rounded-[42px] overflow-hidden">
					{/* Status bar */}
					<div className="flex items-center justify-between px-8 pt-4 pb-2">
						<span className="text-xs text-foreground/50 font-medium">9:41</span>
						<div className="flex items-center gap-1.5">
							<div className="flex gap-0.5">
								<div className="w-1 h-1 bg-foreground/50 rounded-full" />
								<div className="w-1 h-1 bg-foreground/50 rounded-full" />
								<div className="w-1 h-1 bg-foreground/50 rounded-full" />
								<div className="w-1 h-1 bg-foreground/30 rounded-full" />
							</div>
							<div className="w-6 h-3 border border-foreground/50 rounded-sm ml-1">
								<div className="w-4 h-full bg-emerald-400 rounded-sm" />
							</div>
						</div>
					</div>

					{/* App header */}
					<div className="flex items-center justify-between px-5 py-3 border-b border-border">
						<div className="flex items-center gap-3">
							<div className="w-8 h-8 rounded-lg bg-foreground/10 flex items-center justify-center">
								<SupersetIcon className="w-4 h-4 text-white" />
							</div>
							<div>
								<div className="text-sm font-semibold text-foreground">
									Superset Agent
								</div>
								<div className="text-[10px] text-emerald-400">● Online</div>
							</div>
						</div>
					</div>

					{/* Chat messages */}
					<div className="flex flex-col gap-4 p-4">
						{CHAT_MESSAGES.map((msg) => (
							<div
								key={msg.id}
								className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
							>
								<div
									className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
										msg.role === "user"
											? "bg-blue-500 text-white"
											: "bg-foreground/10 text-foreground"
									}`}
								>
									<p className="text-sm leading-relaxed whitespace-pre-line">
										{msg.content}
									</p>
								</div>
							</div>
						))}
					</div>

					{/* Input bar */}
					<div className="absolute bottom-6 left-4 right-4">
						<div className="flex items-center gap-2 px-4 py-3 bg-foreground/10 rounded-full border border-border">
							<span className="text-sm text-muted-foreground/70 flex-1">
								Message...
							</span>
							<div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
								<svg
									className="w-4 h-4 text-white"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									aria-hidden="true"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M5 10l7-7m0 0l7 7m-7-7v18"
									/>
								</svg>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
