import { DeletedUsersTable } from "./components/DeletedUsersTable";

export default function DeletedUsersPage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Deleted Users</h1>
				<p className="text-muted-foreground">
					Manage users queued for deletion. Users can be restored or permanently
					deleted.
				</p>
			</div>
			<DeletedUsersTable />
		</div>
	);
}
