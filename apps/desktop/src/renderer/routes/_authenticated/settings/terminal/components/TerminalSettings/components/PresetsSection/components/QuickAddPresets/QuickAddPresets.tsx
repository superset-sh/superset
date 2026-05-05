import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiOutlineCheck, HiOutlinePlus } from "react-icons/hi2";
import { getPresetIcon } from "renderer/assets/app-icons/preset-icons";
import type { PresetTemplate } from "../../constants";

interface QuickAddPresetsProps {
	templates: PresetTemplate[];
	isDark: boolean;
	isCreatePending: boolean;
	isTemplateAdded: (template: PresetTemplate) => boolean;
	onAddTemplate: (template: PresetTemplate) => void;
}

export function QuickAddPresets({
	templates,
	isDark,
	isCreatePending,
	isTemplateAdded,
	onAddTemplate,
}: QuickAddPresetsProps) {
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<span className="text-xs text-muted-foreground mr-1">Quick add</span>
			{templates.map((template) => {
				const alreadyAdded = isTemplateAdded(template);
				const presetIcon = getPresetIcon(template.name, isDark);
				const disabled = alreadyAdded || isCreatePending;
				return (
					<Tooltip key={template.name}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={() => onAddTemplate(template)}
								disabled={disabled}
								className={cn(
									"inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors",
									"hover:bg-accent hover:text-accent-foreground",
									"disabled:cursor-not-allowed disabled:opacity-50",
									alreadyAdded && "text-muted-foreground",
								)}
							>
								{alreadyAdded ? (
									<HiOutlineCheck className="size-3" />
								) : presetIcon ? (
									<img
										src={presetIcon}
										alt=""
										className="size-3 object-contain"
									/>
								) : (
									<HiOutlinePlus className="size-3" />
								)}
								{template.name}
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom" showArrow={false}>
							{alreadyAdded ? "Already added" : template.preset.description}
						</TooltipContent>
					</Tooltip>
				);
			})}
		</div>
	);
}
