import { TRPCError } from "@trpc/server";

// Token writes create a lock directory next to the token file, which is where
// a full disk surfaces. That is the user's environment, not a bug.
export async function writeAuth<Result>(
	operation: () => Promise<Result>,
): Promise<Result> {
	try {
		return await operation();
	} catch (error) {
		if ((error as NodeJS.ErrnoException | null)?.code === "ENOSPC") {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: error instanceof Error ? error.message : String(error),
			});
		}
		throw error;
	}
}
