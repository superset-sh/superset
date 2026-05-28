import type { BranchPrefixMode } from "@superset/shared/workspace-launch";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { BranchPrefixControl } from "renderer/routes/_authenticated/settings/components/BranchPrefixControl";

interface BranchPrefixSectionProps {
	projectId: string;
	hostUrl: string;
	/** Current override; `null` means the project inherits the host default. */
	mode: BranchPrefixMode | null;
	customPrefix: string | null;
	onChanged: () => void;
}

export function BranchPrefixSection({
	projectId,
	hostUrl,
	mode,
	customPrefix,
	onChanged,
}: BranchPrefixSectionProps) {
	const setMutation = useMutation({
		mutationFn: (vars: {
			mode: BranchPrefixMode | null;
			customPrefix: string | null;
		}) =>
			getHostServiceClientByUrl(hostUrl).project.setBranchPrefix.mutate({
				projectId,
				...vars,
			}),
		onSuccess: () => onChanged(),
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : "Failed to update branch prefix",
			),
	});

	return (
		<BranchPrefixControl
			mode={mode}
			customPrefix={customPrefix}
			showDefault
			disabled={setMutation.isPending}
			onChange={(next) => setMutation.mutate(next)}
		/>
	);
}
