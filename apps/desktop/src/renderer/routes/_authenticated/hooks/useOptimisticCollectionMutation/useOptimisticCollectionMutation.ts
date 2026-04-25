import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";

export type PersistableTransaction = {
	isPersisted: {
		promise: Promise<unknown>;
	};
};

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}

	if (typeof error === "string" && error.trim()) {
		return error;
	}

	return "The local change was rolled back.";
}

export function useOptimisticCollectionMutation(scope: string) {
	const reportFailure = useCallback(
		(title: string, error: unknown) => {
			console.error(`[${scope}] ${title}:`, error);
			toast.error(title, {
				description: getErrorMessage(error),
			});
		},
		[scope],
	);

	return useCallback(
		(
			failureTitle: string,
			mutation: () => PersistableTransaction,
		): PersistableTransaction | null => {
			try {
				const transaction = mutation();

				void transaction.isPersisted.promise.catch((error) => {
					reportFailure(failureTitle, error);
				});

				return transaction;
			} catch (error) {
				reportFailure(failureTitle, error);
				return null;
			}
		},
		[reportFailure],
	);
}
