import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { HiChevronDown, HiOutlinePencil } from "react-icons/hi2";

interface PromptGroupAdvancedOptionsProps {
	showAdvanced: boolean;
	onShowAdvancedChange: (open: boolean) => void;
	branchInputValue: string;
	onBranchInputChange: (value: string) => void;
	onBranchInputBlur: () => void;
	onEditPrefix: () => void;
	runSetupScript: boolean;
	onRunSetupScriptChange: (checked: boolean) => void;
	shortcutHint?: string;
}

export function PromptGroupAdvancedOptions({
	showAdvanced,
	onShowAdvancedChange,
	branchInputValue,
	onBranchInputChange,
	onBranchInputBlur,
	onEditPrefix,
	runSetupScript,
	onRunSetupScriptChange,
	shortcutHint,
}: PromptGroupAdvancedOptionsProps) {
	return (
		<Collapsible open={showAdvanced} onOpenChange={onShowAdvancedChange}>
			<div className="flex items-center justify-between">
				<CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
					<HiChevronDown
						className={`size-3 transition-transform ${showAdvanced ? "" : "-rotate-90"}`}
					/>
					Advanced options
				</CollapsibleTrigger>
				{shortcutHint && (
					<span className="text-[11px] text-muted-foreground/50">
						{shortcutHint}
					</span>
				)}
			</div>
			<CollapsibleContent className="pt-3 space-y-3">
				<div className="space-y-1.5">
					<div className="flex items-center justify-between">
						<label htmlFor="branch" className="text-xs text-muted-foreground">
							Branch name
						</label>
						<button
							type="button"
							onClick={onEditPrefix}
							className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							<HiOutlinePencil className="size-3" />
							<span>Edit prefix</span>
						</button>
					</div>
					<Input
						id="branch"
						className="h-8 text-sm font-mono"
						placeholder="auto-generated"
						value={branchInputValue}
						onChange={(event) => onBranchInputChange(event.target.value)}
						onBlur={onBranchInputBlur}
					/>
				</div>

				<div className="flex items-center justify-between">
					<Label
						htmlFor="run-setup-script"
						className="text-xs text-muted-foreground"
					>
						Run setup script
					</Label>
					<Switch
						id="run-setup-script"
						checked={runSetupScript}
						onCheckedChange={onRunSetupScriptChange}
					/>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
