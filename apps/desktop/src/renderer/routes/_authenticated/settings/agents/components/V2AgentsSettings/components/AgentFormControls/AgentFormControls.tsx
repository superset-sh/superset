import type { PromptTransport } from "@superset/shared/agent-prompt-launch";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { cn } from "@superset/ui/utils";
import { AgentIcon } from "../AgentIcon";

/**
 * Shared layout primitives and composites for the agent settings forms, used by
 * both the edit pane (`AgentDetail`) and the create pane (`NewCustomAgentDetail`)
 * so spacing, copy, and control semantics stay in sync.
 */

interface AgentDetailHeaderProps {
	iconId?: string | null;
	presetId: string;
	title: string;
	subtitle: string;
}

/** Icon + title + subtitle header shared by the edit and create panes. */
export function AgentDetailHeader({
	iconId,
	presetId,
	title,
	subtitle,
}: AgentDetailHeaderProps) {
	return (
		<div className="mb-8 flex items-center gap-3">
			<AgentIcon iconId={iconId} presetId={presetId} className="size-8" />
			<div className="min-w-0 flex-1">
				<h2 className="text-xl font-semibold truncate">{title}</h2>
				<p className="text-sm text-muted-foreground mt-0.5 truncate">
					{subtitle}
				</p>
			</div>
		</div>
	);
}

interface AgentLaunchFieldsProps {
	/** Prefix for field ids so multiple instances stay unique. */
	idPrefix: string;
	commandText: string;
	onCommandTextChange: (value: string) => void;
	/** Called on blur — used by the edit pane to autosave. */
	onCommandBlur?: () => void;
	promptArgsText: string;
	onPromptArgsTextChange: (value: string) => void;
	onPromptArgsBlur?: () => void;
	promptTransport: PromptTransport;
	onPromptTransportChange: (next: PromptTransport) => void;
}

/**
 * The "Launch" section (command, prompt-only args, transport). The edit pane
 * wires the blur callbacks to autosave; the create pane omits them and reads
 * the controlled values on submit.
 */
export function AgentLaunchFields({
	idPrefix,
	commandText,
	onCommandTextChange,
	onCommandBlur,
	promptArgsText,
	onPromptArgsTextChange,
	onPromptArgsBlur,
	promptTransport,
	onPromptTransportChange,
}: AgentLaunchFieldsProps) {
	return (
		<Section title="Launch">
			<StackedField
				label="Command"
				hint="Argv used to launch the agent."
				htmlFor={`${idPrefix}-command`}
			>
				<Input
					id={`${idPrefix}-command`}
					className="font-mono text-xs"
					value={commandText}
					onChange={(e) => onCommandTextChange(e.target.value)}
					onBlur={onCommandBlur}
					placeholder="claude --dangerously-skip-permissions"
				/>
			</StackedField>

			<StackedField
				label="Prompt-only args"
				hint={
					<>
						Added only when launching with a prompt — e.g. <code>--</code>,{" "}
						<code>--prompt</code>, <code>-i</code>.
					</>
				}
				htmlFor={`${idPrefix}-prompt-args`}
			>
				<Input
					id={`${idPrefix}-prompt-args`}
					className="font-mono text-xs"
					value={promptArgsText}
					onChange={(e) => onPromptArgsTextChange(e.target.value)}
					onBlur={onPromptArgsBlur}
					placeholder="--prompt"
				/>
			</StackedField>

			<StackedField
				label="Prompt transport"
				hint="How the prompt is delivered to the process."
			>
				<PromptTransportToggle
					value={promptTransport}
					onChange={onPromptTransportChange}
				/>
			</StackedField>
		</Section>
	);
}

export function Section({
	title,
	children,
}: {
	title: string;
	children?: React.ReactNode;
}) {
	return (
		<section className="space-y-3">
			<h3 className="text-sm font-medium">{title}</h3>
			{children ? <div className="space-y-5">{children}</div> : null}
		</section>
	);
}

interface StackedFieldProps {
	label: string;
	hint?: React.ReactNode;
	htmlFor?: string;
	children: React.ReactNode;
}

export function StackedField({
	label,
	hint,
	htmlFor,
	children,
}: StackedFieldProps) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={htmlFor} className="text-sm font-medium">
				{label}
			</Label>
			{hint && <p className="text-xs text-muted-foreground -mt-1">{hint}</p>}
			{children}
		</div>
	);
}

interface PromptTransportToggleProps {
	value: PromptTransport;
	onChange: (next: PromptTransport) => void;
}

const TRANSPORT_OPTIONS: readonly PromptTransport[] = ["argv", "stdin"];

export function PromptTransportToggle({
	value,
	onChange,
}: PromptTransportToggleProps) {
	return (
		<div className="inline-flex rounded-md border border-border overflow-hidden">
			{TRANSPORT_OPTIONS.map((option, index) => {
				const isSelected = value === option;
				return (
					<button
						key={option}
						type="button"
						aria-pressed={isSelected}
						aria-label={`Prompt transport: ${option}`}
						onClick={() => onChange(option)}
						className={cn(
							"px-3 py-1 text-xs font-medium transition-colors",
							index > 0 && "border-l border-border",
							isSelected
								? "bg-accent text-accent-foreground"
								: "bg-transparent text-muted-foreground hover:bg-accent/50",
						)}
					>
						{option}
					</button>
				);
			})}
		</div>
	);
}
