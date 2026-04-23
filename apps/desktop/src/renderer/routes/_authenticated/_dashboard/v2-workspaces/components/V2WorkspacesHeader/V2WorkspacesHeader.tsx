import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@superset/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import {
	LuCloud,
	LuLaptop,
	LuLayers,
	LuMonitor,
	LuSearch,
} from "react-icons/lu";
import type { V2WorkspaceDeviceCounts } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	useV2WorkspacesFilterStore,
	type V2WorkspacesDeviceFilter,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";

interface V2WorkspacesHeaderProps {
	counts: V2WorkspaceDeviceCounts;
}

const DEVICE_FILTER_OPTIONS: Array<{
	value: V2WorkspacesDeviceFilter;
	label: string;
	Icon: typeof LuLayers | null;
}> = [
	{ value: "all", label: "All", Icon: LuLayers },
	{ value: "this-device", label: "This device", Icon: LuLaptop },
	{ value: "other-devices", label: "Other devices", Icon: LuMonitor },
	{ value: "cloud", label: "Cloud", Icon: LuCloud },
];

export function V2WorkspacesHeader({ counts }: V2WorkspacesHeaderProps) {
	const searchQuery = useV2WorkspacesFilterStore((state) => state.searchQuery);
	const setSearchQuery = useV2WorkspacesFilterStore(
		(state) => state.setSearchQuery,
	);
	const deviceFilter = useV2WorkspacesFilterStore(
		(state) => state.deviceFilter,
	);
	const setDeviceFilter = useV2WorkspacesFilterStore(
		(state) => state.setDeviceFilter,
	);

	const countForFilter = (value: V2WorkspacesDeviceFilter): number => {
		switch (value) {
			case "all":
				return counts.all;
			case "this-device":
				return counts.thisDevice;
			case "other-devices":
				return counts.otherDevices;
			case "cloud":
				return counts.cloud;
		}
	};

	return (
		<div className="border-b border-border">
			<div className="flex w-full flex-wrap items-center justify-between gap-3 px-6 py-4">
				<h1 className="text-sm font-semibold tracking-tight">Workspaces</h1>

				<div className="flex flex-wrap items-center gap-2">
					<InputGroup className="w-72">
						<InputGroupAddon align="inline-start">
							<LuSearch className="size-4" />
						</InputGroupAddon>
						<InputGroupInput
							type="search"
							placeholder="Search workspaces…"
							value={searchQuery}
							onChange={(event) => setSearchQuery(event.target.value)}
						/>
					</InputGroup>

					<ToggleGroup
						type="single"
						variant="outline"
						size="sm"
						value={deviceFilter}
						onValueChange={(value) => {
							if (value) setDeviceFilter(value as V2WorkspacesDeviceFilter);
						}}
					>
						{DEVICE_FILTER_OPTIONS.map(({ value, label, Icon }) => (
							<ToggleGroupItem
								key={value}
								value={value}
								aria-label={label}
								className="gap-1.5"
							>
								{Icon ? <Icon className="size-3.5" /> : null}
								<span>{label}</span>
								<span className="tabular-nums text-muted-foreground">
									{countForFilter(value)}
								</span>
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</div>
			</div>
		</div>
	);
}
