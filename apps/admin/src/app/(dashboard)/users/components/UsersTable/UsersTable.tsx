"use client";

import { formatDistanceToNow } from "date-fns";
import { Loader2, User } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
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

import { useTRPC } from "@/trpc/react";

export function UsersTable() {
	const trpc = useTRPC();
	const { data, isLoading, error } = useQuery(
		trpc.admin.listUsers.queryOptions(),
	);

	if (isLoading) {
		return (
			<Card>
				<CardContent className="flex items-center justify-center py-12">
					<Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center justify-center py-12 text-center">
					<div className="text-destructive mb-4">
						<svg
							className="h-12 w-12"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
					</div>
					<p className="text-lg font-medium">Failed to load users</p>
					<p className="text-muted-foreground text-sm">
						{error.message || "An error occurred while fetching users"}
					</p>
				</CardContent>
			</Card>
		);
	}

	if (!data || data.length === 0) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center justify-center py-12 text-center">
					<User className="text-muted-foreground mb-4 h-12 w-12" />
					<p className="text-lg font-medium">No users yet</p>
					<p className="text-muted-foreground text-sm">
						Users will appear here as they sign up
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>All Users</CardTitle>
				<CardDescription>
					{data.length} user{data.length !== 1 ? "s" : ""} registered
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>User</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Joined</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{data.map((user) => (
							<TableRow key={user.id}>
								<TableCell>
									<div className="flex items-center gap-3">
										<Avatar className="h-8 w-8">
											<AvatarImage src={user.avatarUrl ?? undefined} />
											<AvatarFallback>
												{user.name
													.split(" ")
													.map((n) => n[0])
													.join("")
													.toUpperCase()
													.slice(0, 2)}
											</AvatarFallback>
										</Avatar>
										<span className="font-medium">{user.name}</span>
									</div>
								</TableCell>
								<TableCell>{user.email}</TableCell>
								<TableCell>
									<div className="text-sm">
										{formatDistanceToNow(new Date(user.createdAt), {
											addSuffix: true,
										})}
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
