import { Trans, useLingui } from "@lingui/react/macro";
import type { HostAgentConfig } from "@superset/host-service/settings";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { ExistingSessionOption } from "./components/ExistingSessionOption";
import { NewSessionOption } from "./components/NewSessionOption";
import { EXISTING_PREFIX, NEW_PREFIX } from "./hooks/useAgentSessionTarget";
import { useAgentSessionTitles } from "./hooks/useAgentSessionTitles";

interface AgentSessionPickerProps {
	workspaceId: string | null;
	value: string | null;
	onValueChange: (next: string) => void;
	sessions: TerminalAgentBinding[];
	configs: HostAgentConfig[];
}

export function AgentSessionPicker({
	workspaceId,
	value,
	onValueChange,
	sessions,
	configs,
}: AgentSessionPickerProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const { titles, refreshTitles } = useAgentSessionTitles({
		workspaceId,
		enabled: sessions.length > 0,
		open,
	});
	const session = sessions.find(
		(item) => `${EXISTING_PREFIX}${item.terminalId}` === value,
	);
	const config = configs.find((item) => `${NEW_PREFIX}${item.id}` === value);
	const select = (next: string) => {
		onValueChange(next);
		setOpen(false);
	};
	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next && sessions.length > 0) void refreshTitles();
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={t({ message: "Choose agent" })}
					className="inline-flex h-7 min-w-0 max-w-56 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground"
				>
					{session ? (
						<ExistingSessionOption
							binding={session}
							sessionTitle={titles.get(session.terminalId)}
							compact={
								!sessions.some(
									(item) =>
										item.terminalId !== session.terminalId &&
										item.agentId === session.agentId,
								)
							}
						/>
					) : config ? (
						<NewSessionOption label={config.label} presetId={config.presetId} />
					) : (
						<span>
							<Trans>Choose agent</Trans>
						</span>
					)}
					<ChevronDown className="size-3 shrink-0 opacity-60" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				sideOffset={6}
				className="w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg p-0 shadow-lg"
				onKeyDown={(event) => event.stopPropagation()}
			>
				<Command
					loop
					label={t({ message: "Choose agent" })}
					defaultValue={value ?? undefined}
				>
					<CommandInput
						aria-label={t({ message: "Choose agent" })}
						placeholder={t({ message: "Search" })}
						className="h-9 text-xs"
					/>
					<CommandList
						aria-label={t({ message: "Choose agent" })}
						className="max-h-72 p-1"
					>
						<CommandEmpty>
							<Trans>No results found.</Trans>
						</CommandEmpty>
						{sessions.length > 0 && (
							<CommandGroup
								heading={t({ message: "Active sessions" })}
								className="[&_[cmdk-group-heading]]:text-[11px]"
							>
								{sessions.map((item) => {
									const key = `${EXISTING_PREFIX}${item.terminalId}`;
									return (
										<CommandItem
											key={key}
											value={key}
											keywords={[
												item.agentId,
												item.terminalId,
												titles.get(item.terminalId) ?? "",
											]}
											onSelect={() => select(key)}
											className="gap-3 rounded-md py-2 text-xs"
										>
											<ExistingSessionOption
												binding={item}
												sessionTitle={titles.get(item.terminalId)}
											/>
											{value === key && (
												<Check
													aria-hidden
													className="ml-auto size-3.5 shrink-0"
												/>
											)}
										</CommandItem>
									);
								})}
							</CommandGroup>
						)}
						{configs.length > 0 && (
							<CommandGroup
								heading={t({ message: "Start new session" })}
								className="[&_[cmdk-group-heading]]:text-[11px]"
							>
								{configs.map((item) => {
									const key = `${NEW_PREFIX}${item.id}`;
									return (
										<CommandItem
											key={key}
											value={key}
											keywords={[item.label, item.presetId]}
											onSelect={() => select(key)}
											className="gap-3 rounded-md py-2 text-xs"
										>
											<NewSessionOption
												label={item.label}
												presetId={item.presetId}
											/>
											{value === key && (
												<Check
													aria-hidden
													className="ml-auto size-3.5 shrink-0"
												/>
											)}
										</CommandItem>
									);
								})}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
