import {
	useGeneralAccess,
	useShareDirectory,
} from "@/screens/(authenticated)/components/ShareAccess";
import {
	useWorkspaceSharing,
	type WorkspaceVisibility,
} from "../useWorkspaceSharing";

/** Who can open a cloud workspace without being invited. */
export function useWorkspaceGeneralAccess(id: string | undefined) {
	const { sharing, setVisibility } = useWorkspaceSharing(id);
	const share = useShareDirectory();
	return useGeneralAccess({
		value: sharing.data?.visibility ?? "just_me",
		values: ["just_me", "org"],
		organizationName: share.organizationName,
		onChange: (next) => setVisibility.mutateAsync(next as WorkspaceVisibility),
	});
}
