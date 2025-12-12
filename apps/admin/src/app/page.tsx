import { api } from "@/trpc/server";

export default async function Home() {
	const users = await (await api()).user.all.query();

	return (
		<main className="flex min-h-screen flex-col items-center justify-center p-24">
			<h1 className="text-4xl font-bold">Superset Admin</h1>
			<p className="mt-4 text-muted-foreground">Admin dashboard</p>
			<div className="mt-8 rounded-lg border p-4">
				<h2 className="text-lg font-semibold">tRPC Test Query</h2>
				<p className="text-sm text-muted-foreground">
					Users in database: {users.length}
				</p>
				{users.length > 0 && (
					<ul className="mt-2 text-sm">
						{users.slice(0, 5).map((user) => (
							<li key={user.id}>{user.email}</li>
						))}
					</ul>
				)}
			</div>
		</main>
	);
}
