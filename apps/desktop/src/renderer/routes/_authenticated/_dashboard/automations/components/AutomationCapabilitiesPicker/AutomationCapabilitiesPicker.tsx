import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, PackageCheck, ShieldCheck, TerminalSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { PickerTrigger } from "renderer/components/PickerTrigger";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

export interface AutomationCapabilityBindingValue {
	capabilityVersionId: string;
	enabled?: boolean;
	config?: Record<string, unknown>;
	displayOrder?: number;
}

export interface AutomationCapabilitySelectedItem {
	capabilityVersionId: string;
	name: string;
	type: "skill" | "cli";
	version?: string | null;
}

interface AutomationCapabilitiesPickerProps {
	value: AutomationCapabilityBindingValue[];
	onChange: (next: AutomationCapabilityBindingValue[]) => void;
	className?: string;
	align?: "start" | "end";
	disabled?: boolean;
	selectedItems?: AutomationCapabilitySelectedItem[];
	scopeLabel?: string;
}

type CapabilityTypeFilter = "all" | "skill" | "cli";

type CapabilityListItem = Awaited<
	ReturnType<typeof apiTrpcClient.capability.list.query>
>[number];

function capabilityTypeLabel(type: "skill" | "cli"): string {
	return type === "skill" ? "Skill" : "CLI";
}

function capabilityIcon(type: "skill" | "cli") {
	return type === "cli" ? (
		<TerminalSquare className="size-3.5" />
	) : (
		<PackageCheck className="size-3.5" />
	);
}

function isSelectableCapability(item: CapabilityListItem): boolean {
	return (
		item.status === "active" &&
		item.auditStatus === "passed" &&
		Boolean(item.currentVersionId)
	);
}

function reindexBindings(
	bindings: AutomationCapabilityBindingValue[],
): AutomationCapabilityBindingValue[] {
	return bindings.map((binding, index) => ({
		capabilityVersionId: binding.capabilityVersionId,
		enabled: binding.enabled ?? true,
		config: binding.config ?? {},
		displayOrder: index,
	}));
}

function searchTextForCapability(item: CapabilityListItem): string {
	return [item.name, item.slug, item.description ?? ""].join(" ").toLowerCase();
}

function selectedFallbackMap(items: AutomationCapabilitySelectedItem[] = []) {
	return new Map(items.map((item) => [item.capabilityVersionId, item]));
}

function CapabilityRow({
	item,
	selected,
	onToggle,
}: {
	item: CapabilityListItem;
	selected: boolean;
	onToggle: () => void;
}) {
	return (
		<CommandItem
			value={`${item.name} ${item.slug} ${item.description ?? ""}`}
			onSelect={onToggle}
			className="items-start gap-3 px-3 py-2"
		>
			<span className="mt-0.5 flex size-4 items-center justify-center">
				{selected ? <Check className="size-4 text-primary" /> : null}
			</span>
			<span className="min-w-0 flex-1 space-y-1">
				<span className="flex min-w-0 items-center gap-2">
					<span className="truncate font-medium">{item.name}</span>
					<Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px]">
						{capabilityIcon(item.type)}
						{capabilityTypeLabel(item.type)}
					</Badge>
					<Badge
						variant="outline"
						className="h-5 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] text-emerald-700 dark:text-emerald-300"
					>
						<ShieldCheck className="size-3" />
						Security passed
					</Badge>
				</span>
				<span className="line-clamp-2 text-xs text-muted-foreground">
					{item.description || "No description provided."}
				</span>
			</span>
		</CommandItem>
	);
}

export function AutomationCapabilitiesPicker({
	value,
	onChange,
	className,
	align = "start",
	disabled,
	selectedItems,
	scopeLabel = "Automation",
}: AutomationCapabilitiesPickerProps) {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [typeFilter, setTypeFilter] = useState<CapabilityTypeFilter>("all");
	const capabilitiesQuery = useQuery({
		queryKey: ["capability", "list", "automation-picker"],
		queryFn: () => apiTrpcClient.capability.list.query(),
		staleTime: 30_000,
	});

	const selectedVersionIds = useMemo(
		() =>
			new Set(
				value
					.filter((binding) => binding.enabled !== false)
					.map((binding) => binding.capabilityVersionId),
			),
		[value],
	);
	const fallbackByVersionId = useMemo(
		() => selectedFallbackMap(selectedItems),
		[selectedItems],
	);

	const rows = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		return (capabilitiesQuery.data ?? [])
			.filter(isSelectableCapability)
			.filter((item) => typeFilter === "all" || item.type === typeFilter)
			.filter(
				(item) =>
					!normalizedQuery ||
					searchTextForCapability(item).includes(normalizedQuery),
			);
	}, [capabilitiesQuery.data, query, typeFilter]);

	const selectedRows = rows.filter(
		(item) =>
			item.currentVersionId && selectedVersionIds.has(item.currentVersionId),
	);
	const availableRows = rows.filter(
		(item) =>
			!item.currentVersionId || !selectedVersionIds.has(item.currentVersionId),
	);

	const selectedLabels = useMemo(() => {
		const byVersionId = new Map(
			(capabilitiesQuery.data ?? [])
				.filter((item) => item.currentVersionId)
				.map((item) => [item.currentVersionId as string, item.name]),
		);
		return [...selectedVersionIds].map(
			(versionId) =>
				byVersionId.get(versionId) ??
				fallbackByVersionId.get(versionId)?.name ??
				"Selected tool",
		);
	}, [capabilitiesQuery.data, fallbackByVersionId, selectedVersionIds]);

	const label =
		selectedLabels.length === 0
			? "No tools"
			: selectedLabels.length === 1
				? selectedLabels[0]
				: `${selectedLabels.length} selected`;

	const toggleCapability = (item: CapabilityListItem) => {
		if (!item.currentVersionId) return;
		if (selectedVersionIds.has(item.currentVersionId)) {
			onChange(
				reindexBindings(
					value.filter(
						(binding) => binding.capabilityVersionId !== item.currentVersionId,
					),
				),
			);
			return;
		}
		onChange(
			reindexBindings([
				...value,
				{
					capabilityVersionId: item.currentVersionId,
					enabled: true,
					config: {},
				},
			]),
		);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<PickerTrigger
					className={className}
					disabled={disabled}
					icon={<PackageCheck className="size-4 shrink-0" />}
					label={label}
					contentClassName={align === "end" ? "justify-end" : undefined}
					labelClassName={align === "end" ? "text-right" : undefined}
				/>
			</PopoverTrigger>
			<PopoverContent align={align} className="w-[430px] p-0">
				<Command shouldFilter={false}>
					<div className="flex items-center justify-between border-b px-3 py-2">
						<div>
							<div className="text-sm font-medium">Tools & Skills</div>
							<div className="text-xs text-muted-foreground">
								Choose approved tools for this {scopeLabel}.
							</div>
						</div>
						<Button
							variant="ghost"
							size="xs"
							onClick={() => {
								setOpen(false);
								navigate({ to: "/settings/tools-and-skills" });
							}}
						>
							Manage
						</Button>
					</div>
					<CommandInput
						value={query}
						onValueChange={setQuery}
						placeholder="Search tools and skills..."
					/>
					<div className="flex gap-1 border-b px-2 py-2">
						{(
							[
								["all", "All"],
								["skill", "Skills"],
								["cli", "CLI"],
							] as const
						).map(([value, label]) => (
							<Button
								key={value}
								type="button"
								variant={typeFilter === value ? "secondary" : "ghost"}
								size="xs"
								onClick={() => setTypeFilter(value)}
							>
								{label}
							</Button>
						))}
					</div>
					<CommandList className="max-h-[340px]">
						<CommandEmpty>
							{capabilitiesQuery.isLoading
								? "Loading tools..."
								: "No approved tools found."}
						</CommandEmpty>
						{selectedRows.length > 0 ? (
							<CommandGroup heading="Selected">
								{selectedRows.map((item) => (
									<CapabilityRow
										key={item.id}
										item={item}
										selected={true}
										onToggle={() => toggleCapability(item)}
									/>
								))}
							</CommandGroup>
						) : null}
						{availableRows.length > 0 ? (
							<CommandGroup
								heading={selectedRows.length > 0 ? "Available" : undefined}
							>
								{availableRows.map((item) => (
									<CapabilityRow
										key={item.id}
										item={item}
										selected={false}
										onToggle={() => toggleCapability(item)}
									/>
								))}
							</CommandGroup>
						) : null}
					</CommandList>
					{selectedLabels.length > 0 ? (
						<div className="border-t px-3 py-2 text-xs text-muted-foreground">
							{selectedLabels.length} selected for this {scopeLabel}.
						</div>
					) : null}
				</Command>
			</PopoverContent>
		</Popover>
	);
}
