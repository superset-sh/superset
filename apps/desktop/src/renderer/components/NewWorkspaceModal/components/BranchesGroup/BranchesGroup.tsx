import { CommandEmpty, CommandGroup, CommandItem } from "@superset/ui/command";
import { GoGitBranch } from "react-icons/go";

const MOCK_BRANCHES = [
	{
		name: "main",
		lastCommitDate: Date.now() - 1000 * 60 * 30,
		isLocal: true,
		isRemote: true,
		isDefault: true,
	},
	{
		name: "develop",
		lastCommitDate: Date.now() - 1000 * 60 * 60 * 2,
		isLocal: true,
		isRemote: true,
		isDefault: false,
	},
	{
		name: "feat/new-dashboard",
		lastCommitDate: Date.now() - 1000 * 60 * 60 * 5,
		isLocal: true,
		isRemote: true,
		isDefault: false,
	},
	{
		name: "fix/login-redirect",
		lastCommitDate: Date.now() - 1000 * 60 * 60 * 24,
		isLocal: false,
		isRemote: true,
		isDefault: false,
	},
	{
		name: "chore/update-ci",
		lastCommitDate: Date.now() - 1000 * 60 * 60 * 24 * 3,
		isLocal: true,
		isRemote: false,
		isDefault: false,
	},
	{
		name: "refactor/auth-module",
		lastCommitDate: Date.now() - 1000 * 60 * 60 * 24 * 7,
		isLocal: false,
		isRemote: true,
		isDefault: false,
	},
];

function formatRelative(timestamp: number): string {
	const seconds = Math.floor((Date.now() - timestamp) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export function BranchesGroup() {
	return (
		<CommandGroup>
			<CommandEmpty>No branches found.</CommandEmpty>
			{MOCK_BRANCHES.map((branch) => (
				<CommandItem
					key={branch.name}
					value={branch.name}
					onSelect={() => {
						console.log("[mock] Create workspace from branch", branch.name);
					}}
					className="group"
				>
					<GoGitBranch className="size-4 shrink-0 text-muted-foreground" />
					<span className="truncate flex-1">{branch.name}</span>
					{branch.isDefault && (
						<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
							default
						</span>
					)}
					{!branch.isLocal && branch.isRemote && (
						<span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded shrink-0">
							remote
						</span>
					)}
					<span className="text-xs text-muted-foreground shrink-0 group-data-[selected=true]:hidden">
						{formatRelative(branch.lastCommitDate)}
					</span>
					<span className="text-xs text-muted-foreground shrink-0 hidden group-data-[selected=true]:inline">
						Open →
					</span>
				</CommandItem>
			))}
		</CommandGroup>
	);
}
