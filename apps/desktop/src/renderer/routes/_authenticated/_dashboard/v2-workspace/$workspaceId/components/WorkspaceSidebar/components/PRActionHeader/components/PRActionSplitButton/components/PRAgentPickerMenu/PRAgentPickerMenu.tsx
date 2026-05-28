import type { HostAgentConfig } from "@superset/host-service/settings";
import {
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { LuPlus } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";
import {
	type AgentTarget,
	EXISTING_PREFIX,
	NEW_PREFIX,
} from "renderer/hooks/agents/useAgentTarget";
import type { TerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";

interface PRAgentPickerMenuProps {
	sessions: TerminalAgentBinding[];
	configs: HostAgentConfig[];
	/** Currently-selected encoded value, used to mark the active item. */
	value: string | null;
	/** Fired when the user picks an item — receives the resolved target so
	 *  the parent can both persist the pick and submit through it. */
	onPickTarget: (target: AgentTarget) => void;
}

const groupLabelClass =
	"text-[10px] font-normal uppercase tracking-wide text-muted-foreground";

/**
 * DropdownMenu rendition of the agent picker — mirrors `AgentPickerSelect`'s
 * "Active sessions" + "Start new" grouping for visual continuity with the
 * DiffPane comment composer. New sessions use the persisted placement
 * default (split-pane) since the PR menu doesn't surface the placement
 * toggle.
 */
export function PRAgentPickerMenu({
	sessions,
	configs,
	value,
	onPickTarget,
}: PRAgentPickerMenuProps) {
	const hasSessions = sessions.length > 0;
	const hasConfigs = configs.length > 0;

	if (!hasSessions && !hasConfigs) {
		return (
			<DropdownMenuItem disabled className="text-xs text-muted-foreground">
				No agents configured — add a preset in Settings
			</DropdownMenuItem>
		);
	}

	return (
		<>
			<DropdownMenuLabel className={groupLabelClass}>
				Active sessions
			</DropdownMenuLabel>
			{hasSessions ? (
				sessions.map((session) => {
					const encoded = `${EXISTING_PREFIX}${session.terminalId}`;
					return (
						<DropdownMenuItem
							key={session.terminalId}
							onSelect={() =>
								onPickTarget({
									kind: "existing",
									terminalId: session.terminalId,
								})
							}
							className="text-xs"
							data-active={encoded === value ? "true" : undefined}
						>
							<ExistingSessionItem binding={session} />
						</DropdownMenuItem>
					);
				})
			) : (
				<DropdownMenuItem disabled className="text-xs text-muted-foreground">
					No active sessions
				</DropdownMenuItem>
			)}
			{hasConfigs ? (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuLabel className={groupLabelClass}>
						Start new
					</DropdownMenuLabel>
					{configs.map((config) => {
						const encoded = `${NEW_PREFIX}${config.id}`;
						return (
							<DropdownMenuItem
								key={config.id}
								onSelect={() =>
									onPickTarget({
										kind: "new",
										configId: config.id,
										// Placement is the persisted default — picked up by
										// the parent's usePRActionAgentTarget. The menu
										// itself doesn't surface a toggle (one-click flow).
										placement: "split-pane",
									})
								}
								className="text-xs"
								data-active={encoded === value ? "true" : undefined}
							>
								<NewSessionItem
									label={config.label}
									presetId={config.presetId}
								/>
							</DropdownMenuItem>
						);
					})}
				</>
			) : null}
		</>
	);
}

function ExistingSessionItem({ binding }: { binding: TerminalAgentBinding }) {
	const iconSrc = usePresetIcon(binding.agentId);
	return (
		<span className="inline-flex items-center gap-1.5">
			{iconSrc ? (
				<img
					src={iconSrc}
					alt=""
					className="size-3.5 shrink-0"
					draggable={false}
				/>
			) : null}
			<span>{binding.agentId}</span>
			<span className="text-muted-foreground/70">
				· {binding.terminalId.slice(0, 6)}
			</span>
		</span>
	);
}

function NewSessionItem({
	label,
	presetId,
}: {
	label: string;
	presetId: string;
}) {
	const iconSrc = usePresetIcon(presetId);
	return (
		<span className="inline-flex items-center gap-1.5">
			{iconSrc ? (
				<img
					src={iconSrc}
					alt=""
					className="size-3.5 shrink-0"
					draggable={false}
				/>
			) : (
				<LuPlus className="size-3.5 text-muted-foreground" />
			)}
			<span>{label}</span>
		</span>
	);
}
