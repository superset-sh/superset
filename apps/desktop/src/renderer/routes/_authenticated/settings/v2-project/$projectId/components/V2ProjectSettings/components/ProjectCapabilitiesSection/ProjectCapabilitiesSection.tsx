import { Badge } from "@superset/ui/badge";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import {
	AutomationCapabilitiesPicker,
	type AutomationCapabilityBindingValue,
	type AutomationCapabilitySelectedItem,
} from "renderer/routes/_authenticated/_dashboard/automations/components/AutomationCapabilitiesPicker";

interface ProjectCapabilitiesSectionProps {
	projectId: string;
}

type ProjectCapabilityBinding = Awaited<
	ReturnType<typeof apiTrpcClient.capability.listProjectBindings.query>
>[number];

function queryKey(projectId: string) {
	return ["project-capabilities", projectId] as const;
}

function valuesFromBindings(
	bindings: ProjectCapabilityBinding[],
): AutomationCapabilityBindingValue[] {
	return bindings.map((binding, index) => ({
		capabilityVersionId: binding.capabilityVersionId,
		enabled: binding.enabled,
		config: binding.config,
		displayOrder: index,
	}));
}

function selectedItemsFromBindings(
	bindings: ProjectCapabilityBinding[],
): AutomationCapabilitySelectedItem[] {
	return bindings.map((binding) => ({
		capabilityVersionId: binding.capabilityVersionId,
		name: binding.name,
		type: binding.type,
		version: binding.version,
	}));
}

export function ProjectCapabilitiesSection({
	projectId,
}: ProjectCapabilitiesSectionProps) {
	const queryClient = useQueryClient();
	const projectQueryKey = useMemo(() => queryKey(projectId), [projectId]);
	const bindingsQuery = useQuery({
		queryKey: projectQueryKey,
		queryFn: () =>
			apiTrpcClient.capability.listProjectBindings.query({ projectId }),
		staleTime: 30_000,
	});
	const [value, setValue] = useState<AutomationCapabilityBindingValue[]>([]);

	const selectedItems = useMemo(
		() => selectedItemsFromBindings(bindingsQuery.data ?? []),
		[bindingsQuery.data],
	);

	const saveMutation = useMutation({
		mutationFn: (capabilities: AutomationCapabilityBindingValue[]) =>
			apiTrpcClient.capability.setProjectBindings.mutate({
				projectId,
				capabilities,
			}),
		onSuccess: (nextBindings) => {
			queryClient.setQueryData(projectQueryKey, nextBindings);
			setValue(valuesFromBindings(nextBindings));
			toast.success("Default tools updated");
		},
		onError: (error) => {
			setValue(valuesFromBindings(bindingsQuery.data ?? []));
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to update default tools",
			);
		},
	});

	useEffect(() => {
		if (saveMutation.isPending) return;
		setValue(valuesFromBindings(bindingsQuery.data ?? []));
	}, [bindingsQuery.data, saveMutation.isPending]);

	const handleChange = (next: AutomationCapabilityBindingValue[]) => {
		setValue(next);
		saveMutation.mutate(next);
	};

	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-2">
				<AutomationCapabilitiesPicker
					value={value}
					onChange={handleChange}
					disabled={bindingsQuery.isLoading || saveMutation.isPending}
					selectedItems={selectedItems}
					scopeLabel="Project"
				/>
				{saveMutation.isPending ? (
					<span className="text-xs text-muted-foreground">Saving...</span>
				) : null}
			</div>
			{selectedItems.length > 0 ? (
				<div className="flex flex-wrap gap-1.5">
					{selectedItems.map((item) => (
						<Badge
							key={item.capabilityVersionId}
							variant="secondary"
							className="max-w-full gap-1"
						>
							<span className="truncate">{item.name}</span>
							<span className="text-[10px] uppercase text-muted-foreground">
								{item.type}
							</span>
						</Badge>
					))}
				</div>
			) : (
				<p className="text-xs text-muted-foreground">
					No default tools selected. New Automations can still choose tools
					manually.
				</p>
			)}
			<p className="text-xs text-muted-foreground">
				New Automations created from this Project start with these defaults,
				then save their own pinned selection.
			</p>
		</div>
	);
}
