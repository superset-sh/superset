import { Trans } from "@lingui/react/macro";
import type { SessionConfigOption } from "@superset/chat/protocol";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuCheck, LuChevronDown } from "react-icons/lu";

export type ModelPickerProps = {
	configOptions: SessionConfigOption[];
	onSelect: (configId: string, value: string) => void;
};

function currentLabel(option: SessionConfigOption | undefined) {
	return option?.options.find((entry) => entry.id === option.currentValue)
		?.label;
}

export function ModelPicker({ configOptions, onSelect }: ModelPickerProps) {
	const model = configOptions.find((option) => option.category === "model");
	const effort = configOptions.find(
		(option) => option.category === "thought_level",
	);
	if (!model?.options.length) return null;

	const sections = [
		{ option: model, title: <Trans>Select model</Trans> },
		...(effort?.options.length
			? [{ option: effort, title: <Trans>Effort</Trans> }]
			: []),
	];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm transition-colors hover:bg-accent"
				>
					<span className="text-foreground">
						{currentLabel(model) ?? model.label}
					</span>
					{effort && currentLabel(effort) ? (
						<span className="text-muted-foreground">
							{currentLabel(effort)}
						</span>
					) : null}
					<LuChevronDown className="size-3.5 text-muted-foreground" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				side="top"
				className="max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-64 overflow-y-auto"
			>
				{sections.map(({ option, title }, index) => (
					<div key={option.id}>
						{index > 0 ? <DropdownMenuSeparator /> : null}
						<DropdownMenuLabel className="font-normal text-muted-foreground">
							{title}
						</DropdownMenuLabel>
						{option.options.map((entry) => (
							<DropdownMenuItem
								key={entry.id}
								onSelect={() => {
									if (entry.id !== option.currentValue) {
										onSelect(option.id, entry.id);
									}
								}}
								className="items-start"
							>
								<div className="flex min-w-0 flex-1 flex-col">
									<span>{entry.label}</span>
									{entry.description ? (
										<span className="text-xs text-muted-foreground">
											{entry.description}
										</span>
									) : null}
								</div>
								{entry.id === option.currentValue ? (
									<LuCheck className="mt-0.5 size-4 shrink-0" />
								) : null}
							</DropdownMenuItem>
						))}
					</div>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
