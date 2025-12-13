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
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { use } from "react";
import {
	LuArrowLeft,
	LuCalendar,
	LuLoaderCircle,
	LuMail,
	LuUser,
} from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

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

interface UserEventsPageProps {
	params: Promise<{ personId: string }>;
}

export default function UserEventsPage({ params }: UserEventsPageProps) {
	const { personId } = use(params);
	const trpc = useTRPC();

	const { data: eventsData, isLoading: isLoadingEvents } = useQuery(
		trpc.analytics.getUserEvents.queryOptions({
			personId,
			limit: 100,
		}),
	);

	const { data: usersData, isLoading: isLoadingUser } = useQuery(
		trpc.analytics.searchUsers.queryOptions({
			search: personId,
			limit: 1,
		}),
	);

	const user = usersData?.users?.[0];
	const events = eventsData?.events ?? [];
	const isLoading = isLoadingEvents || isLoadingUser;

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div className="flex items-center gap-4">
					<Button variant="ghost" size="icon" asChild>
						<Link href="/events">
							<LuArrowLeft className="h-4 w-4" />
						</Link>
					</Button>
					<div>
						<h1 className="text-3xl font-bold tracking-tight">User Events</h1>
						<p className="text-muted-foreground">Loading user data...</p>
					</div>
				</div>
				<Card>
					<CardContent className="flex items-center justify-center py-12">
						<LuLoaderCircle className="text-muted-foreground h-8 w-8 animate-spin" />
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header with back button */}
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="icon" asChild>
					<Link href="/events">
						<LuArrowLeft className="h-4 w-4" />
					</Link>
				</Button>
				<div>
					<h1 className="text-3xl font-bold tracking-tight">
						{user?.name || user?.email || personId.slice(0, 16) + "..."}
					</h1>
					<p className="text-muted-foreground">User event timeline</p>
				</div>
			</div>

			{/* User Info Card */}
			<Card>
				<CardHeader>
					<CardTitle>User Information</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 md:grid-cols-3">
						<div className="flex items-center gap-3">
							<div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full">
								<LuUser className="h-5 w-5" />
							</div>
							<div>
								<div className="text-muted-foreground text-xs">Name</div>
								<div className="font-medium">{user?.name || "Unknown"}</div>
							</div>
						</div>

						<div className="flex items-center gap-3">
							<div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full">
								<LuMail className="h-5 w-5" />
							</div>
							<div>
								<div className="text-muted-foreground text-xs">Email</div>
								<div className="font-medium">{user?.email || "Unknown"}</div>
							</div>
						</div>

						<div className="flex items-center gap-3">
							<div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full">
								<LuCalendar className="h-5 w-5" />
							</div>
							<div>
								<div className="text-muted-foreground text-xs">First Seen</div>
								<div className="font-medium">
									{user?.createdAt
										? format(new Date(user.createdAt), "MMM d, yyyy")
										: "Unknown"}
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Event Timeline */}
			<Card>
				<CardHeader>
					<CardTitle>Event Timeline</CardTitle>
					<CardDescription>
						{events.length} events recorded for this user
					</CardDescription>
				</CardHeader>
				<CardContent>
					{events.length === 0 ? (
						<p className="text-muted-foreground py-8 text-center">
							No events recorded for this user
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Event</TableHead>
									<TableHead>Time</TableHead>
									<TableHead>Properties</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{events.map((event) => (
									<TableRow key={event.id}>
										<TableCell>
											<Badge variant={getEventColor(event.event)}>
												{event.event}
											</Badge>
										</TableCell>
										<TableCell>
											<div className="flex flex-col">
												<span className="text-sm">
													{format(new Date(event.timestamp), "MMM d, yyyy")}
												</span>
												<span className="text-muted-foreground text-xs">
													{formatDistanceToNow(new Date(event.timestamp), {
														addSuffix: true,
													})}
												</span>
											</div>
										</TableCell>
										<TableCell>
											{event.properties &&
											Object.keys(event.properties).length > 0 ? (
												<div className="text-muted-foreground max-w-md truncate font-mono text-xs">
													{JSON.stringify(event.properties)}
												</div>
											) : (
												<span className="text-muted-foreground text-xs">
													No properties
												</span>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
