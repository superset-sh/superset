import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { signOut } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export function useDeleteAccount() {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [isDeleting, setIsDeleting] = useState(false);

	const deleteAccount = useCallback(async () => {
		setIsDeleting(true);
		try {
			await apiClient.user.deleteAccount.mutate();
			// sessions are already deleted server-side, so signOut may 401
			await signOut().catch(() => {});
			queryClient.clear();
			router.replace("/(auth)/sign-in");
		} catch (error) {
			console.error("[account/delete] Failed to delete account:", error);
			throw error;
		} finally {
			setIsDeleting(false);
		}
	}, [router, queryClient]);

	return { deleteAccount, isDeleting };
}
