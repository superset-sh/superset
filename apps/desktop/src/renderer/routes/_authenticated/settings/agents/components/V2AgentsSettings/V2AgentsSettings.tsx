import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type {
	AgentPreset,
	HostAgentConfigDto,
} from "@superset/host-service/settings";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw } from "lucide-react";
import { useMemo } from "react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { V2AgentCard } from "./components/V2AgentCard";

const QUERY_KEY = ["host-agent-configs"] as const;

export function V2AgentsSettings() {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const isDark = useIsDarkTheme();

	const configsQuery = useQuery({
		queryKey: [...QUERY_KEY, activeHostUrl] as const,
		enabled: !!activeHostUrl,
		queryFn: () => {
			if (!activeHostUrl) return [] as HostAgentConfigDto[];
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.list.query();
		},
	});

	const presetsQuery = useQuery({
		queryKey: [...QUERY_KEY, "presets", activeHostUrl] as const,
		enabled: !!activeHostUrl,
		queryFn: () => {
			if (!activeHostUrl) return [] as AgentPreset[];
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.listPresets.query();
		},
	});

	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, activeHostUrl] });

	const addMutation = useMutation({
		mutationFn: (presetId: string) => {
			if (!activeHostUrl) throw new Error("Host service is not available");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.add.mutate({ presetId });
		},
		onSuccess: () => invalidate(),
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to add agent"),
	});

	const reorderMutation = useMutation({
		mutationFn: (ids: string[]) => {
			if (!activeHostUrl) throw new Error("Host service is not available");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.reorder.mutate({ ids });
		},
		onMutate: async (ids) => {
			await queryClient.cancelQueries({
				queryKey: [...QUERY_KEY, activeHostUrl],
			});
			const previous = queryClient.getQueryData<HostAgentConfigDto[]>([
				...QUERY_KEY,
				activeHostUrl,
			]);
			if (previous) {
				const byId = new Map(previous.map((row) => [row.id, row]));
				const next = ids
					.map((id, index) => {
						const row = byId.get(id);
						return row ? { ...row, order: index } : null;
					})
					.filter((row): row is HostAgentConfigDto => row !== null);
				queryClient.setQueryData([...QUERY_KEY, activeHostUrl], next);
			}
			return { previous };
		},
		onError: (err, _ids, ctx) => {
			if (ctx?.previous) {
				queryClient.setQueryData([...QUERY_KEY, activeHostUrl], ctx.previous);
			}
			toast.error(err instanceof Error ? err.message : "Failed to reorder");
		},
		onSettled: () => invalidate(),
	});

	const resetMutation = useMutation({
		mutationFn: () => {
			if (!activeHostUrl) throw new Error("Host service is not available");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.resetToDefaults.mutate();
		},
		onSuccess: () => invalidate(),
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : "Failed to reset"),
	});

	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 150, tolerance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const configs = configsQuery.data ?? [];
	const presets = presetsQuery.data ?? [];
	const sortableIds = useMemo(() => configs.map((row) => row.id), [configs]);
	const descriptionByPresetId = useMemo(
		() =>
			new Map(presets.map((preset) => [preset.presetId, preset.description])),
		[presets],
	);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = sortableIds.indexOf(String(active.id));
		const newIndex = sortableIds.indexOf(String(over.id));
		if (oldIndex < 0 || newIndex < 0) return;
		reorderMutation.mutate(arrayMove(sortableIds, oldIndex, newIndex));
	};

	return (
		<div className="p-6 max-w-5xl w-full">
			<div className="mb-8 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold">Agents</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Configure terminal agents available on this host. Drag to reorder.
					</p>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => resetMutation.mutate()}
						disabled={resetMutation.isPending}
					>
						<RotateCcw className="size-4" /> Reset to defaults
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button size="sm">
								<Plus className="size-4" /> Add agent
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{presets.map((preset) => {
								const icon = getPresetIcon(preset.presetId, isDark);
								return (
									<DropdownMenuItem
										key={preset.presetId}
										onSelect={() => addMutation.mutate(preset.presetId)}
										className="gap-2"
									>
										{icon ? (
											<img
												src={icon}
												alt=""
												className="size-4 object-contain shrink-0"
											/>
										) : (
											<div className="size-4 rounded bg-muted shrink-0" />
										)}
										{preset.label}
									</DropdownMenuItem>
								);
							})}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{configsQuery.isLoading ? (
				<p className="text-sm text-muted-foreground">
					Loading agent settings...
				</p>
			) : configsQuery.isError ? (
				<div className="space-y-2">
					<p className="text-sm text-destructive">
						Couldn't load agent settings:{" "}
						{configsQuery.error instanceof Error
							? configsQuery.error.message
							: "host service unavailable"}
					</p>
					<Button
						variant="outline"
						size="sm"
						onClick={() => configsQuery.refetch()}
					>
						Retry
					</Button>
				</div>
			) : configs.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					No agents configured. Add one from the menu above.
				</p>
			) : (
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={sortableIds}
						strategy={verticalListSortingStrategy}
					>
						<div className="space-y-3">
							{configs.map((config) => (
								<V2AgentCard
									key={config.id}
									config={config}
									description={
										descriptionByPresetId.get(config.presetId) ??
										"Terminal agent launch configuration"
									}
									onChanged={invalidate}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
			)}
		</div>
	);
}
