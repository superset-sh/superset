import { CommandEmpty, CommandGroup, CommandItem } from "@superset/ui/command";
import { GoGitPullRequest } from "react-icons/go";

const MOCK_PRS = [
	{
		number: 197,
		title: "docs: update root README with contribution guide",
		author: "satyapatel",
		url: "https://github.com/org/repo/pull/197",
		branch: "docs/update-readme",
	},
	{
		number: 196,
		title: "fix(api/users): make discoverable flag nullable",
		author: "jsmith",
		url: "https://github.com/org/repo/pull/196",
		branch: "fix/discoverable-nullable",
	},
	{
		number: 192,
		title: "ux(mobile): keep reps and sets visible during rest timer",
		author: "amelia",
		url: "https://github.com/org/repo/pull/192",
		branch: "ux/rest-timer-visibility",
	},
	{
		number: 189,
		title: "feat(desktop): add keyboard shortcut for quick switcher",
		author: "satyapatel",
		url: "https://github.com/org/repo/pull/189",
		branch: "feat/quick-switcher-shortcut",
	},
	{
		number: 185,
		title: "chore: bump dependencies to latest stable versions",
		author: "dependabot",
		url: "https://github.com/org/repo/pull/185",
		branch: "chore/bump-deps",
	},
];

export function PullRequestsGroup() {
	return (
		<CommandGroup>
			<CommandEmpty>No pull requests found.</CommandEmpty>
			{MOCK_PRS.map((pr) => (
				<CommandItem
					key={pr.number}
					value={`#${pr.number} ${pr.title} ${pr.author} ${pr.url}`}
					onSelect={() => {
						console.log("[mock] Create workspace from PR", pr.number);
					}}
					className="group"
				>
					<GoGitPullRequest className="size-4 shrink-0 text-emerald-500" />
					<span className="text-muted-foreground shrink-0 text-xs tabular-nums">
						#{pr.number}
					</span>
					<span className="truncate flex-1">{pr.title}</span>
					<span className="text-xs text-muted-foreground shrink-0 group-data-[selected=true]:hidden">
						{pr.author}
					</span>
					<span className="text-xs text-muted-foreground shrink-0 hidden group-data-[selected=true]:inline">
						Open →
					</span>
				</CommandItem>
			))}
		</CommandGroup>
	);
}
