import { UsersTable } from "./components/UsersTable";

export default function UsersPage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">Users</h1>
				<p className="text-muted-foreground">
					View all registered users in the platform
				</p>
			</div>
			<UsersTable />
		</div>
	);
}
