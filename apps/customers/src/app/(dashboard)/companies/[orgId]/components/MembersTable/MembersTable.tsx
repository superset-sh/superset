"use client";

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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import type { IconType } from "react-icons";
import { LuMessageSquare, LuMonitor, LuTerminal } from "react-icons/lu";

import { HealthBadge } from "../../../../components/HealthBadge";

type Member = RouterOutputs["customers"]["companyDetail"]["members"][number];

const SURFACE_ICONS: Record<string, { icon: IconType; label: string }> = {
	desktop: { icon: LuMonitor, label: "Desktop" },
	cli: { icon: LuTerminal, label: "CLI" },
	chat: { icon: LuMessageSquare, label: "Chat / agents" },
};

const numberFormat = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumFractionDigits: 1,
});

function SurfaceCell({ surface }: { surface: string | null }) {
	if (!surface) return <span className="text-muted-foreground">—</span>;
	const entry = SURFACE_ICONS[surface];
	if (!entry) return <span>{surface}</span>;
	const Icon = entry.icon;
	return (
		<Tooltip>
			<TooltipTrigger>
				<Icon className="text-muted-foreground size-4" />
			</TooltipTrigger>
			<TooltipContent>{entry.label}</TooltipContent>
		</Tooltip>
	);
}

export interface MembersTableProps {
	members: Member[];
}

export function MembersTable({ members }: MembersTableProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Members</CardTitle>
				<CardDescription>
					{members.length} member{members.length === 1 ? "" : "s"}, sorted by
					recent activity
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>User</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Last active</TableHead>
							<TableHead>Events (7d)</TableHead>
							<TableHead>Events (30d)</TableHead>
							<TableHead>Active days (30d)</TableHead>
							<TableHead>Surface</TableHead>
							<TableHead>Health</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{members.map((member) => {
							const isNewUser =
								!member.hasActivityData &&
								Date.now() - member.userCreatedAt.getTime() <
									14 * 24 * 60 * 60 * 1000;
							return (
								<TableRow key={member.userId}>
									<TableCell>
										<div className="flex items-center gap-3">
											<Avatar className="size-8">
												<AvatarImage src={member.image ?? undefined} />
												<AvatarFallback>
													{getInitials(member.name, member.email)}
												</AvatarFallback>
											</Avatar>
											<div className="flex flex-col">
												<span className="font-medium">{member.name}</span>
												<span className="text-muted-foreground text-xs">
													{member.email}
												</span>
											</div>
										</div>
									</TableCell>
									<TableCell>
										<Badge variant="outline">{member.role}</Badge>
									</TableCell>
									<TableCell className="text-muted-foreground text-sm">
										{member.lastActiveAt
											? formatDistanceToNow(member.lastActiveAt, {
													addSuffix: true,
												})
											: "never"}
									</TableCell>
									<TableCell>{numberFormat.format(member.events7d)}</TableCell>
									<TableCell>{numberFormat.format(member.events30d)}</TableCell>
									<TableCell>{member.activeDays30}</TableCell>
									<TableCell>
										<SurfaceCell surface={member.topSurface} />
									</TableCell>
									<TableCell>
										{isNewUser ? (
											<Badge variant="outline">New — no data yet</Badge>
										) : (
											<HealthBadge health={member.health} />
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
