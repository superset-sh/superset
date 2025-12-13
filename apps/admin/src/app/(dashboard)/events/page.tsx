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
import { Input } from "@superset/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useState } from "react";
import { LuLoaderCircle, LuSearch, LuUser } from "react-icons/lu";

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

export default function EventsPage() {
	const [limit] = useState(50);
	const [searchQuery, setSearchQuery] = useState("");
	const trpc = useTRPC();

	const { data, isLoading, error } = useQuery(
		trpc.analytics.getRecentUserEvents.queryOptions({ limit }),
	);

	const { data: usersData, isLoading: isLoadingUsers } = useQuery(
		trpc.analytics.searchUsers.queryOptions({
			search: searchQuery || undefined,
			limit: 20,
		}),
	);

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">User Events</h1>
					<p className="text-muted-foreground">
						Track user activity and drill down into individual users
					</p>
				</div>
				<Card>
					<CardContent className="flex items-center justify-center py-12">
						<LuLoaderCircle className="text-muted-foreground h-8 w-8 animate-spin" />
					</CardContent>
				</Card>
			</div>
		);
	}

	if (error) {
		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">User Events</h1>
				</div>
				<Card>
					<CardContent className="text-muted-foreground py-12 text-center">
						<p>Failed to load events</p>
						<p className="text-sm">{error.message}</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	const events = data?.events ?? [];

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">User Events</h1>
				<p className="text-muted-foreground">
					Track user activity and drill down into individual users
				</p>
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				{/* Users Search Panel */}
				<Card className="lg:col-span-1">
					<CardHeader>
						<CardTitle>Users</CardTitle>
						<CardDescription>Search and browse users</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="relative">
							<LuSearch className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
							<Input
								placeholder="Search by email or name..."
								className="pl-9"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
							/>
						</div>

						<div className="space-y-2">
							{isLoadingUsers ? (
								<div className="flex justify-center py-4">
									<LuLoaderCircle className="text-muted-foreground h-5 w-5 animate-spin" />
								</div>
							) : usersData?.users && usersData.users.length > 0 ? (
								usersData.users.map((user) => (
									<Link
										key={user.id}
										href={`/events/${user.id}`}
										className="hover:bg-muted flex items-center gap-3 rounded-lg border p-3 transition-colors"
									>
										<div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full">
											<LuUser className="h-4 w-4" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="truncate font-medium">
												{user.name || user.email || user.distinctIds[0]}
											</div>
											{user.email && user.name && (
												<div className="text-muted-foreground truncate text-xs">
													{user.email}
												</div>
											)}
										</div>
									</Link>
								))
							) : (
								<p className="text-muted-foreground py-4 text-center text-sm">
									{searchQuery ? "No users found" : "Start typing to search"}
								</p>
							)}
						</div>
					</CardContent>
				</Card>

				{/* Recent Events Table */}
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>Recent Activity</CardTitle>
						<CardDescription>
							{events.length} most recent events across all users
						</CardDescription>
					</CardHeader>
					<CardContent>
						{events.length === 0 ? (
							<p className="text-muted-foreground py-8 text-center">
								No events recorded yet
							</p>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>User</TableHead>
										<TableHead>Event</TableHead>
										<TableHead>Time</TableHead>
										<TableHead className="w-[80px]" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{events.map((event) => (
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
											<TableCell>
												<Button variant="ghost" size="sm" asChild>
													<Link href={`/events/${event.distinctId}`}>View</Link>
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
