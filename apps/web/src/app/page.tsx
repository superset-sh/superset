import { api } from "@/trpc/server";

export default async function Home() {
	const trpc = await api();

	const users = await trpc.user.all.query();

	let me = null;
	let authError = null;
	try {
		me = await trpc.user.me.query();
	} catch (e) {
		authError = e instanceof Error ? e.message : "Unknown error";
	}

	return (
		<main className="flex min-h-screen flex-col items-center justify-center p-24">
			<h1 className="text-4xl font-bold">Superset Web</h1>
			<p className="mt-4 text-muted-foreground">
				Run 10+ parallel coding agents on your machine
			</p>

			<div className="mt-8 grid gap-4 md:grid-cols-2">
				<div className="rounded-lg border p-4">
					<h2 className="text-lg font-semibold">Public Query</h2>
					<p className="text-xs text-green-600">user.all()</p>
					<p className="mt-2 text-sm text-muted-foreground">
						Users in database: {users.length}
					</p>
					{users.length > 0 && (
						<ul className="mt-2 text-sm">
							{users.slice(0, 3).map((user) => (
								<li key={user.id}>{user.email}</li>
							))}
						</ul>
					)}
				</div>

				<div className="rounded-lg border p-4">
					<h2 className="text-lg font-semibold">Protected Query</h2>
					<p className="text-xs text-blue-600">user.me()</p>
					{authError ? (
						<p className="mt-2 text-sm text-red-500">Error: {authError}</p>
					) : me ? (
						<div className="mt-2 text-sm">
							<p>Logged in as: {me.email}</p>
							<p className="text-muted-foreground">{me.name}</p>
						</div>
					) : (
						<p className="mt-2 text-sm text-yellow-600">
							No user found for MOCK_USER_ID
						</p>
					)}
				</div>
			</div>
		</main>
	);
}
