import { z } from "zod";
import { publicProcedure, router } from "../..";

interface SeededUser {
	email: string;
	name: string;
	createdAt: string;
}

interface SeededUsersResult {
	users: SeededUser[];
	total: number;
	error: string | null;
}

const SUPABASE_LOCAL_API = "http://localhost:54321";
const SUPABASE_LOCAL_SERVICE_KEY =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function fetchSeededUsers(): Promise<SeededUsersResult> {
	try {
		const response = await fetch(
			`${SUPABASE_LOCAL_API}/auth/v1/admin/users?per_page=50`,
			{
				headers: {
					apikey: SUPABASE_LOCAL_SERVICE_KEY,
					Authorization: `Bearer ${SUPABASE_LOCAL_SERVICE_KEY}`,
				},
			},
		);

		if (!response.ok) {
			return {
				users: [],
				total: 0,
				error: `Supabase API: ${response.status}`,
			};
		}

		const data = (await response.json()) as {
			users: Array<{
				email: string;
				user_metadata?: { name?: string };
				created_at: string;
			}>;
		};

		const users: SeededUser[] = (data.users ?? []).map((u) => ({
			email: u.email,
			name: u.user_metadata?.name ?? "",
			createdAt: u.created_at,
		}));

		return { users, total: users.length, error: null };
	} catch (error) {
		return {
			users: [],
			total: 0,
			error: error instanceof Error ? error.message : "Failed to fetch",
		};
	}
}

export const createSeedUsersRouter = () => {
	return router({
		getSeededUsers: publicProcedure
			.input(z.object({ worktreePath: z.string() }))
			.query(async (): Promise<SeededUsersResult> => {
				return fetchSeededUsers();
			}),
	});
};
