"use client";

import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
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
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { LuArrowRight, LuLoaderCircle } from "react-icons/lu";

interface UserEvent {
	id: string;
	event: string;
	distinctId: string;
	timestamp: string;
	person?: {
		email?: string;
		name?: string;
	};
}

interface UserEventsTableProps {
	events: UserEvent[];
	isLoading?: boolean;
	error?: string;
	showViewAll?: boolean;
}

function getEventColor(event: string) {
	if (event.startsWith("$")) {
		return "secondary";
	}
	if (event.includes("completed") || event.includes("success")) {
		return "default";
	}
	if (event.includes("error") || event.includes("failed")) {
		return "destructive";
	}
	return "outline";
}

export function UserEventsTable({
	events,
	isLoading,
	error,
	showViewAll = true,
}: UserEventsTableProps) {
	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Recent Activity</CardTitle>
					<CardDescription>Latest user events</CardDescription>
				</CardHeader>
				<CardContent className="flex items-center justify-center py-12">
					<LuLoaderCircle className="text-muted-foreground h-8 w-8 animate-spin" />
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Recent Activity</CardTitle>
				</CardHeader>
				<CardContent className="text-muted-foreground py-12 text-center">
					<p>Failed to load events</p>
					<p className="text-sm">{error}</p>
				</CardContent>
			</Card>
		);
	}

	if (!events || events.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Recent Activity</CardTitle>
				</CardHeader>
				<CardContent className="text-muted-foreground py-12 text-center">
					<p>No recent events</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<div>
					<CardTitle>Recent Activity</CardTitle>
					<CardDescription>Latest user events across all apps</CardDescription>
				</div>
				{showViewAll && (
					<Button variant="ghost" size="sm" asChild>
						<Link href="/events">
							View All
							<LuArrowRight className="ml-1 h-4 w-4" />
						</Link>
					</Button>
				)}
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>User</TableHead>
							<TableHead>Event</TableHead>
							<TableHead>Time</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{events.slice(0, 10).map((event) => (
							<TableRow key={event.id}>
								<TableCell>
									<div className="flex flex-col">
										<span className="font-medium">
											{event.person?.name ||
												event.person?.email ||
												event.distinctId.slice(0, 12) + "..."}
										</span>
										{event.person?.email && event.person?.name && (
											<span className="text-muted-foreground text-xs">
												{event.person.email}
											</span>
										)}
									</div>
								</TableCell>
								<TableCell>
									<Badge variant={getEventColor(event.event)}>
										{event.event}
									</Badge>
								</TableCell>
								<TableCell className="text-muted-foreground text-sm">
									{formatDistanceToNow(new Date(event.timestamp), {
										addSuffix: true,
									})}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
