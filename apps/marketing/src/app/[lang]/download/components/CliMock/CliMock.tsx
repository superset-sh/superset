// Code-drawn stand-in for a terminal screenshot: the root `superset` command's
// own listing. A real capture would pin a version number and someone's shell
// prompt into an evergreen page; this stays current because the command list is
// the same text the CLI prints.
const COMMANDS: readonly { name: string; summary: string }[] = [
	{ name: "agents", summary: "Manage and run agents" },
	{ name: "auth", summary: "Manage authentication" },
	{ name: "automations", summary: "Manage scheduled automations" },
	{ name: "hosts", summary: "Manage hosts" },
	{ name: "projects", summary: "Manage projects" },
	{ name: "start", summary: "Start the host service" },
	{ name: "tasks", summary: "Manage tasks" },
	{ name: "terminals", summary: "Manage terminals" },
	{ name: "workspaces", summary: "Manage workspaces" },
];

export function CliMock() {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none h-full w-full select-none overflow-hidden font-mono text-[7px] leading-[1.5] sm:text-[8px]"
		>
			<div className="whitespace-nowrap">
				<span className="text-muted-foreground">~/w/demo-app </span>
				<span className="text-brand">main</span>
				<span className="text-muted-foreground"> ❯ </span>
				<span className="text-foreground">superset</span>
			</div>
			<div className="mt-1 whitespace-nowrap text-muted-foreground">
				Command your fleet of coding agents from any shell.
			</div>

			<div className="mt-2">
				{COMMANDS.map((command, index) => (
					<div key={command.name} className="flex gap-2 whitespace-nowrap">
						<span
							className={
								index === 0
									? "w-[68px] shrink-0 bg-foreground px-1 text-background"
									: "w-[68px] shrink-0 px-1 text-foreground"
							}
						>
							{command.name}
						</span>
						<span className="truncate text-muted-foreground">
							{command.summary}
						</span>
					</div>
				))}
			</div>

			<div className="mt-2 whitespace-nowrap text-muted-foreground">
				↑↓ move enter open q quit
			</div>
		</div>
	);
}
