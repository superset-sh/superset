import { getInitials } from "@superset/shared/names";
import type { RouterOutputs } from "@superset/trpc";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Badge } from "@superset/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import type { IconType } from "react-icons";
import { LuMessageSquare, LuMonitor, LuTerminal } from "react-icons/lu";

import { HealthBadge } from "@/components/HealthBadge";
import { SocialLinks } from "@/components/SocialLinks";

import { UserResearchButton } from "./components/UserResearchButton";

type DomainUser = RouterOutputs["customers"]["domainDetail"]["users"][number];

const SURFACE_ICONS: Record<string, { icon: IconType; label: string }> = {
	desktop: { icon: LuMonitor, label: "Desktop" },
	cli: { icon: LuTerminal, label: "CLI" },
	chat: { icon: LuMessageSquare, label: "Chat / agents" },
};

const numberFormat = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumFractionDigits: 1,
});

const SENIORITY_LABELS: Record<string, string> = {
	founder: "Founder",
	exec: "Exec",
	manager: "Manager",
	ic: "IC",
	unknown: "Unknown",
};
const SENIORITY_ORDER = ["founder", "exec", "manager", "ic", "unknown"];

function seniorityOf(user: DomainUser): string {
	return user.research?.seniority ?? "unknown";
}

export interface DomainUsersTableProps {
	users: DomainUser[];
	totalUsers: number;
	domain: string;
}

export function DomainUsersTable({
	users,
	totalUsers,
	domain,
}: DomainUsersTableProps) {
	const [seniority, setSeniority] = useState("all");

	const counts = new Map<string, number>();
	for (const user of users) {
		const bucket = seniorityOf(user);
		counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
	}
	const shown =
		seniority === "all"
			? users
			: users.filter((user) => seniorityOf(user) === seniority);

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between space-y-0">
				<div className="space-y-1.5">
					<CardTitle>Users</CardTitle>
					<CardDescription>
						{seniority !== "all"
							? `${shown.length} of ${users.length} users match`
							: users.length < totalUsers
								? `Showing the ${users.length} most recently active of ${totalUsers.toLocaleString()} users`
								: `${totalUsers} user${totalUsers === 1 ? "" : "s"}, sorted by recent activity`}
					</CardDescription>
				</div>
				<Select value={seniority} onValueChange={setSeniority}>
					<SelectTrigger className="w-44">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All seniorities</SelectItem>
						{SENIORITY_ORDER.map((bucket) => (
							<SelectItem key={bucket} value={bucket}>
								{SENIORITY_LABELS[bucket]} ({counts.get(bucket) ?? 0})
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</CardHeader>
			<CardContent>
				{shown.length === 0 && (
					<p className="text-muted-foreground py-6 text-center text-sm">
						No users match this seniority — research may not have run for
						everyone yet.
					</p>
				)}
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>User</TableHead>
							<TableHead>Last active</TableHead>
							<TableHead>Events (7d)</TableHead>
							<TableHead>Events (30d)</TableHead>
							<TableHead>Active days (30d)</TableHead>
							<TableHead>Surface</TableHead>
							<TableHead>Health</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{shown.map((user) => {
							const surface = user.topSurface
								? SURFACE_ICONS[user.topSurface]
								: null;
							const isNewUser =
								!user.hasActivityData &&
								Date.now() - user.userCreatedAt.getTime() <
									14 * 24 * 60 * 60 * 1000;
							return (
								<TableRow key={user.userId}>
									<TableCell>
										<div className="flex items-center gap-3">
											<Avatar className="size-8">
												<AvatarImage src={user.image ?? undefined} />
												<AvatarFallback>
													{getInitials(user.name, user.email)}
												</AvatarFallback>
											</Avatar>
											<div className="flex flex-col">
												<Link
													to="/users/$userId"
													params={{ userId: user.userId }}
													className="font-medium hover:underline"
												>
													{user.name}
												</Link>
												<span className="text-muted-foreground text-xs">
													{user.email}
												</span>
												{user.research ? (
													<span className="text-muted-foreground flex items-center gap-2 text-xs">
														{user.research.title ?? (
															<span className="italic">Role unknown</span>
														)}
														{user.research.seniority && (
															<Badge
																variant="outline"
																className={
																	user.research.seniority === "founder" ||
																	user.research.seniority === "exec"
																		? "border-sky-500/40 text-sky-400"
																		: undefined
																}
															>
																{SENIORITY_LABELS[user.research.seniority]}
															</Badge>
														)}
														<SocialLinks {...user.research} />
													</span>
												) : (
													<UserResearchButton
														userId={user.userId}
														domain={domain}
													/>
												)}
											</div>
										</div>
									</TableCell>
									<TableCell className="text-muted-foreground text-sm">
										{user.lastActiveAt
											? formatDistanceToNow(user.lastActiveAt, {
													addSuffix: true,
												})
											: "never"}
									</TableCell>
									<TableCell>{numberFormat.format(user.events7d)}</TableCell>
									<TableCell>{numberFormat.format(user.events30d)}</TableCell>
									<TableCell>{user.activeDays30}</TableCell>
									<TableCell>
										{surface ? (
											<surface.icon
												className="text-muted-foreground size-4"
												aria-label={surface.label}
											/>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
									<TableCell>
										{isNewUser ? (
											<Badge variant="outline">New — no data yet</Badge>
										) : (
											<HealthBadge health={user.health} />
										)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
