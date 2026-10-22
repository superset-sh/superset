import { useLingui } from "@lingui/react/macro";
import {
	ORGANIZATION_PLUGIN_ACCESS,
	type OrganizationPluginAccess,
} from "@superset/shared/plugins";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";

interface RoleAccessSelectProps {
	value: OrganizationPluginAccess;
	label: string;
	disabled: boolean;
	onChange: (access: OrganizationPluginAccess) => void;
}

export function RoleAccessSelect({
	value,
	label,
	disabled,
	onChange,
}: RoleAccessSelectProps) {
	const { t } = useLingui();
	const labels: Record<OrganizationPluginAccess, string> = {
		unavailable: t({ message: "Unavailable", context: "plugin access" }),
		available: t({ message: "Available", context: "plugin access" }),
		installed: t({ message: "Installed", context: "plugin access" }),
	};

	return (
		<Select
			value={value}
			disabled={disabled}
			onValueChange={(next) => onChange(next as OrganizationPluginAccess)}
		>
			<SelectTrigger size="sm" className="w-32" aria-label={label}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{ORGANIZATION_PLUGIN_ACCESS.map((access) => (
					<SelectItem key={access} value={access}>
						{labels[access]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
