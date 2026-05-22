import {
	type BranchPrefixMode,
	sanitizeSegment,
} from "@superset/shared/workspace-launch";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { BRANCH_PREFIX_MODE_LABELS_WITH_DEFAULT } from "renderer/routes/_authenticated/settings/utils/branch-prefix";

/** Select value standing in for "no override — inherit the host default". */
const DEFAULT_VALUE = "default";

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
	const [customPrefixInput, setCustomPrefixInput] = useState(
		customPrefix ?? "",
	);
	useEffect(() => {
		setCustomPrefixInput(customPrefix ?? "");
	}, [customPrefix]);

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

	const selectValue = mode ?? DEFAULT_VALUE;

	const handleModeChange = (value: string) => {
		setMutation.mutate({
			mode: value === DEFAULT_VALUE ? null : (value as BranchPrefixMode),
			customPrefix: customPrefixInput || null,
		});
	};

	const handleCustomPrefixBlur = () => {
		const sanitized = sanitizeSegment(customPrefixInput);
		setCustomPrefixInput(sanitized);
		setMutation.mutate({ mode: "custom", customPrefix: sanitized || null });
	};

	return (
		<div className="flex items-center gap-2">
			<Select
				value={selectValue}
				onValueChange={handleModeChange}
				disabled={setMutation.isPending}
			>
				<SelectTrigger className="w-[200px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{Object.entries(BRANCH_PREFIX_MODE_LABELS_WITH_DEFAULT).map(
						([value, label]) => (
							<SelectItem key={value} value={value}>
								{label}
							</SelectItem>
						),
					)}
				</SelectContent>
			</Select>
			{selectValue === "custom" && (
				<Input
					placeholder="Prefix"
					value={customPrefixInput}
					onChange={(e) => setCustomPrefixInput(e.target.value)}
					onBlur={handleCustomPrefixBlur}
					className="w-[120px]"
					disabled={setMutation.isPending}
				/>
			)}
		</div>
	);
}
