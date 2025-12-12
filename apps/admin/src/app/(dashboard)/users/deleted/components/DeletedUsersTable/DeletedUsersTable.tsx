"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { toast } from "@superset/ui/sonner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { LuLoaderCircle, LuRotateCcw, LuTrash2, LuUserX } from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

export function DeletedUsersTable() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useQuery(
		trpc.admin.listDeletedUsers.queryOptions(),
	);

	const [userToDelete, setUserToDelete] = useState<{
		id: string;
		email: string;
		name: string;
	} | null>(null);

	const restoreMutation = useMutation(
		trpc.admin.restoreUser.mutationOptions({
			onSuccess: (_, _variables) => {
				queryClient.invalidateQueries({
					queryKey: trpc.admin.listActiveUsers.queryKey(),
				});
				queryClient.invalidateQueries({
					queryKey: trpc.admin.listDeletedUsers.queryKey(),
				});
				toast.success("User restored successfully");
			},
			onError: (error) => {
				toast.error(`Failed to restore user: ${error.message}`);
			},
		}),
	);

	const permanentDeleteMutation = useMutation(
		trpc.admin.permanentlyDeleteUser.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.admin.listDeletedUsers.queryKey(),
				});
				toast.success(`${userToDelete?.name} has been permanently deleted`);
				setUserToDelete(null);
			},
			onError: (error) => {
				toast.error(`Failed to delete user: ${error.message}`);
			},
		}),
	);

	const handlePermanentDelete = () => {
		if (!userToDelete) return;
		permanentDeleteMutation.mutate({ userId: userToDelete.id });
	};

	if (isLoading) {
		return (
			<Card>
				<CardContent className="flex items-center justify-center py-12">
					<LuLoaderCircle className="text-muted-foreground h-8 w-8 animate-spin" />
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
							aria-hidden="true"
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
					<p className="text-lg font-medium">Failed to load deleted users</p>
					<p className="text-muted-foreground text-sm">
						{error.message || "An error occurred while fetching deleted users"}
					</p>
				</CardContent>
			</Card>
		);
	}

	if (!data || data.length === 0) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center justify-center py-12 text-center">
					<LuUserX className="text-muted-foreground mb-4 h-12 w-12" />
					<p className="text-lg font-medium">No deleted users</p>
					<p className="text-muted-foreground text-sm">
						Users that are soft-deleted will appear here
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Deleted Users</CardTitle>
					<CardDescription>
						{data.length} user{data.length !== 1 ? "s" : ""} queued for deletion
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>User</TableHead>
								<TableHead>Email</TableHead>
								<TableHead>Deleted</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.map((user) => {
								const deletedAt = user.deletedAt
									? new Date(user.deletedAt)
									: null;
								const daysSinceDeleted = deletedAt
									? Math.floor(
											(Date.now() - deletedAt.getTime()) /
												(1000 * 60 * 60 * 24),
										)
									: 0;
								const isOverdue = daysSinceDeleted > 30;

								return (
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
											<div className="space-y-1">
												<div className="text-sm">
													{deletedAt
														? formatDistanceToNow(deletedAt, {
																addSuffix: true,
															})
														: "-"}
												</div>
												{deletedAt && (
													<div
														className={`text-xs ${isOverdue ? "text-destructive" : "text-muted-foreground"}`}
													>
														{daysSinceDeleted} day
														{daysSinceDeleted !== 1 ? "s" : ""} ago
														{isOverdue && " (overdue)"}
													</div>
												)}
											</div>
										</TableCell>
										<TableCell className="text-right">
											<div className="flex justify-end gap-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() =>
														restoreMutation.mutate({ userId: user.id })
													}
													disabled={restoreMutation.isPending}
												>
													{restoreMutation.isPending ? (
														<LuLoaderCircle className="h-4 w-4 animate-spin" />
													) : (
														<LuRotateCcw className="h-4 w-4" />
													)}
													<span className="ml-2">Restore</span>
												</Button>
												<Button
													variant="destructive"
													size="sm"
													onClick={() =>
														setUserToDelete({
															id: user.id,
															email: user.email,
															name: user.name,
														})
													}
													disabled={permanentDeleteMutation.isPending}
												>
													<LuTrash2 className="h-4 w-4" />
													<span className="ml-2">Delete</span>
												</Button>
											</div>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<AlertDialog
				open={!!userToDelete}
				onOpenChange={(open) => !open && setUserToDelete(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Permanently delete user?</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-2">
								<p>
									This will permanently delete{" "}
									<strong>{userToDelete?.name}</strong> ({userToDelete?.email})
									and all their data including:
								</p>
								<ul className="list-disc space-y-1 pl-6">
									<li>All user data</li>
									<li>All associated records</li>
									<li>Their Clerk account</li>
								</ul>
								<p className="text-destructive font-medium">
									This action cannot be undone.
								</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handlePermanentDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={permanentDeleteMutation.isPending}
						>
							{permanentDeleteMutation.isPending ? (
								<LuLoaderCircle className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							Delete Permanently
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
