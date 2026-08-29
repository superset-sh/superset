import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import {
	normalizeWorkspaceTag,
	normalizeWorkspaceTags,
} from "@superset/shared/workspace-tags";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import { ChipButton } from "../../../../../components/TriggerSentence/components/ChipButton";

/**
 * The automation's workspace-tag set: every run's created workspace carries
 * these tags, filing it into the matching sidebar folders. Unchecking a tag
 * removes it; the field adds one (normalized like every tag surface).
 */
export function AutomationTagsPicker({
	tags,
	disabled,
	onChange,
	className,
}: {
	tags: string[];
	disabled?: boolean;
	onChange: (tags: string[]) => void;
	className?: string;
}) {
	const [draft, setDraft] = useState("");

	const addDraft = () => {
		const tag = normalizeWorkspaceTag(draft);
		setDraft("");
		if (tag == null || tags.includes(tag)) return;
		onChange(normalizeWorkspaceTags([...tags, tag]));
	};

	const label =
		tags.length > 0
			? tags.join(", ")
			: i18n._(
					msg({
						id: "dashboard.automations.tagsPicker.empty",
						message: "no tags",
					}),
				);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<span>
					<ChipButton
						label={label}
						empty={tags.length === 0}
						disabled={disabled}
						className={className}
					/>
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
				{tags.map((tag) => (
					<DropdownMenuCheckboxItem
						key={tag}
						checked
						onCheckedChange={() =>
							onChange(tags.filter((existing) => existing !== tag))
						}
					>
						{tag}
					</DropdownMenuCheckboxItem>
				))}
				{tags.length > 0 && <DropdownMenuSeparator />}
				<div className="p-1">
					<Input
						value={draft}
						placeholder={i18n._(
							msg({
								id: "dashboard.automations.tagsPicker.placeholder",
								message: "Add tag…",
							}),
						)}
						disabled={disabled}
						onChange={(event) => setDraft(event.target.value)}
						// The menu owns arrow keys and typeahead; the field keeps
						// what it types.
						onKeyDown={(event) => {
							event.stopPropagation();
							if (event.key === "Enter") {
								event.preventDefault();
								addDraft();
							}
						}}
						className="h-7 text-[13px]"
					/>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
