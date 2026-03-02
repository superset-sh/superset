import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiOutlineCheck } from "react-icons/hi2";
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
		<div className="flex flex-wrap gap-2">
			<span className="text-xs text-muted-foreground mr-1 self-center">
				Quick add:
			</span>
			{templates.map((template) => {
				const alreadyAdded = isTemplateAdded(template);
				const presetIcon = getPresetIcon(template.name, isDark);
				return (
					<Tooltip key={template.name}>
						<TooltipTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className="gap-1.5 text-xs h-7"
								onClick={() => onAddTemplate(template)}
								disabled={alreadyAdded || isCreatePending}
							>
								{alreadyAdded ? (
									<HiOutlineCheck className="h-3 w-3" />
								) : presetIcon ? (
									<img
										src={presetIcon}
										alt=""
										className="h-3 w-3 object-contain"
									/>
								) : null}
								{template.name}
							</Button>
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
