import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuCheck,
	LuChevronDown,
	LuChevronRight,
	LuCopy,
	LuDatabase,
	LuPlay,
	LuRefreshCw,
	LuUsers,
} from "react-icons/lu";

interface SeedOption {
	id: string;
	name: string;
	command: string;
	description: string;
	resetsDb: boolean;
}

const SEED_OPTIONS: SeedOption[] = [
	{
		id: "fixed",
		name: "Fixed Test User",
		command: "npm run seed:test-user:fixed",
		description: "Single user with fixed credentials. Quick & deterministic.",
		resetsDb: false,
	},
	{
		id: "two-users",
		name: "Two Users",
		command: "npm run seed:two-users",
		description:
			"Two users with orgs, copilots, and conversations. Resets DB first.",
		resetsDb: true,
	},
	{
		id: "ui-demo",
		name: "UI Demo",
		command: "npm run seed:ui-demo",
		description:
			"Owner + 3 collaborators with tasks, conversations, and updates.",
		resetsDb: false,
	},
	{
		id: "comprehensive",
		name: "Comprehensive",
		command: "npm run seed:comprehensive",
		description:
			"Two fully-featured users (Alice & Bob) with shared workspace and A2A.",
		resetsDb: false,
	},
	{
		id: "world-model",
		name: "World Model",
		command: "npm run seed:world-model",
		description:
			"Rich entity graph for 3D visualization. 10 people, projects, events, locations.",
		resetsDb: false,
	},
	{
		id: "org-small",
		name: "Org: Small",
		command: "npm run seed:org -- --preset=small",
		description: "5 users, minimal data. Good for quick tests.",
		resetsDb: false,
	},
	{
		id: "org-medium",
		name: "Org: Medium",
		command: "npm run seed:org -- --preset=medium",
		description: "15 users with moderate data. Integration testing.",
		resetsDb: false,
	},
	{
		id: "org-large",
		name: "Org: Large",
		command: "npm run seed:org -- --preset=large",
		description: "30 users with heavy data. Load testing.",
		resetsDb: false,
	},
	{
		id: "org-demo",
		name: "Org: Demo",
		command: "npm run seed:org -- --preset=demo",
		description: "10 users with external contacts. Demo environments.",
		resetsDb: false,
	},
	{
		id: "resetdb",
		name: "Reset DB",
		command: "npm run dev:resetdb",
		description: "Full database reset + restart services + re-seed RAG data.",
		resetsDb: true,
	},
];

interface SeededUser {
	email: string;
	name: string;
	createdAt: string;
}

interface SeedSectionProps {
	onRunSeed: (command: string) => void;
	seededUsers:
		| { users: SeededUser[]; total: number; error: string | null }
		| undefined;
	isLoadingUsers: boolean;
	onRefreshUsers: () => void;
}

function CopyableText({
	text,
	className,
}: {
	text: string;
	className?: string;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<button
			type="button"
			onClick={handleCopy}
			className={cn(
				"inline-flex items-center gap-1 font-mono text-xs px-1 py-0.5 rounded",
				"bg-accent/50 hover:bg-accent transition-colors cursor-pointer",
				className,
			)}
		>
			<span className="truncate">{text}</span>
			{copied ? (
				<LuCheck className="size-2.5 shrink-0 text-green-500" />
			) : (
				<LuCopy className="size-2.5 shrink-0 text-muted-foreground" />
			)}
		</button>
	);
}

export function SeedSection({
	onRunSeed,
	seededUsers,
	isLoadingUsers,
	onRefreshUsers,
}: SeedSectionProps) {
	const [collapsed, setCollapsed] = useState(false);
	const [selectedId, setSelectedId] = useState(SEED_OPTIONS[0].id);

	const selected = SEED_OPTIONS.find((o) => o.id === selectedId);

	const handleRun = () => {
		if (!selected) return;
		onRunSeed(selected.command);
	};

	const users = seededUsers?.users ?? [];

	return (
		<div className="overflow-hidden border-t border-border">
			<button
				type="button"
				onClick={() => setCollapsed(!collapsed)}
				className={cn(
					"flex w-full items-center gap-1.5 px-3 py-2",
					"text-xs font-medium uppercase tracking-wider text-muted-foreground",
					"hover:bg-accent/30 cursor-pointer transition-colors",
				)}
			>
				{collapsed ? (
					<LuChevronRight className="size-3 shrink-0" />
				) : (
					<LuChevronDown className="size-3 shrink-0" />
				)}
				<LuDatabase className="size-3 shrink-0" />
				<span>Seed</span>
				{!collapsed && users.length > 0 && (
					<span className="ml-auto text-[10px] text-muted-foreground">
						{users.length} users
					</span>
				)}
			</button>

			{!collapsed && (
				<div className="px-3 py-2 space-y-2">
					{/* Dropdown + Run */}
					<div className="flex items-center gap-1.5">
						<select
							value={selectedId}
							onChange={(e) => setSelectedId(e.target.value)}
							className={cn(
								"flex-1 min-w-0 text-sm rounded-md px-2 py-1",
								"bg-accent/30 border border-border",
								"text-foreground cursor-pointer",
								"focus:outline-none focus:ring-1 focus:ring-primary",
							)}
						>
							{SEED_OPTIONS.map((option) => (
								<option key={option.id} value={option.id}>
									{option.name}
									{option.resetsDb ? " (resets DB)" : ""}
								</option>
							))}
						</select>
						<Button
							variant="default"
							size="sm"
							className="gap-1 text-xs shrink-0"
							onClick={handleRun}
						>
							<LuPlay className="size-3" />
							Run
						</Button>
					</div>

					{/* Selected seed details */}
					{selected && (
						<p className="text-xs text-muted-foreground">
							{selected.description}
						</p>
					)}

					{/* Seeded users from Supabase */}
					<div className="space-y-1.5 pt-1 border-t border-border/50">
						<div className="flex items-center justify-between">
							<span className="inline-flex items-center gap-1 text-xs font-medium">
								<LuUsers className="size-3" />
								Seeded Users
							</span>
							<button
								type="button"
								onClick={onRefreshUsers}
								className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
							>
								<LuRefreshCw
									className={cn("size-2.5", isLoadingUsers && "animate-spin")}
								/>
								Refresh
							</button>
						</div>

						{isLoadingUsers ? (
							<p className="text-xs text-muted-foreground">Loading...</p>
						) : seededUsers?.error ? (
							<p className="text-xs text-muted-foreground">
								{seededUsers.error}
							</p>
						) : users.length === 0 ? (
							<p className="text-xs text-muted-foreground">
								No users found. Run a seed to create users.
							</p>
						) : (
							<div className="space-y-1 max-h-40 overflow-y-auto">
								{users.map((user) => (
									<div
										key={user.email}
										className="flex items-center gap-1.5 text-xs"
									>
										{user.name && (
											<span className="shrink-0 text-[10px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-400 truncate max-w-[80px]">
												{user.name}
											</span>
										)}
										<CopyableText
											text={user.email}
											className="flex-1 min-w-0"
										/>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
