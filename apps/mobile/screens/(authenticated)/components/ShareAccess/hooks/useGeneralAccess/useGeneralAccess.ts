import { useLingui } from "@lingui/react/macro";
import { Building2, Globe, Lock } from "lucide-react-native";
import type { GeneralAccess, GeneralAccessOption } from "../../types";

export type GeneralAccessValue = "just_me" | "org" | "everyone";

const WIDTH: Record<GeneralAccessValue, number> = {
	just_me: 0,
	org: 1,
	everyone: 2,
};

/** General access for a page or workspace: its options, and a confirmation before going public or narrowing. */
export function useGeneralAccess({
	value,
	values,
	organizationName,
	onChange,
	role,
}: {
	value: GeneralAccessValue;
	values: GeneralAccessValue[];
	organizationName: string;
	onChange: (next: GeneralAccessValue) => Promise<unknown>;
	role?: GeneralAccess["role"];
}): GeneralAccess {
	const { t } = useLingui();
	const all: Record<GeneralAccessValue, GeneralAccessOption> = {
		just_me: {
			value: "just_me",
			label: t({ message: "Only people invited" }),
			description: t({ message: "Only the people listed above can open it" }),
			icon: Lock,
			systemImage: "lock",
		},
		org: {
			value: "org",
			label: t({ message: "Anyone in your organization" }),
			description: t({
				message: `Anyone in ${organizationName} with the link can open it`,
			}),
			icon: Building2,
			systemImage: "building.2",
		},
		everyone: {
			value: "everyone",
			label: t({ message: "Anyone with the link" }),
			description: t({
				message: "Anyone with the link can view it, signed in or not",
			}),
			icon: Globe,
			systemImage: "globe",
		},
	};

	return {
		value,
		options: values.map((option) => all[option]),
		onChange: (next) => onChange(next as GeneralAccessValue),
		confirm: (from, to) => {
			if (to === "everyone") {
				return {
					title: t({ message: "Make this page public?" }),
					message: t({
						message: `Anyone with the link can view it, including people outside ${organizationName} and people who aren't signed in.`,
					}),
					action: t({ message: "Make public" }),
				};
			}
			if (
				WIDTH[to as GeneralAccessValue] >= WIDTH[from as GeneralAccessValue]
			) {
				return null;
			}
			return to === "just_me"
				? {
						title: t({ message: "Limit to people invited?" }),
						message: t({
							message: `Anyone in ${organizationName} who isn't listed here loses access.`,
						}),
						action: t({ message: "Limit access" }),
						destructive: true,
					}
				: {
						title: t({ message: `Limit to ${organizationName}?` }),
						message: t({
							message: `People outside ${organizationName} lose access, and the public link stops working.`,
						}),
						action: t({ message: "Limit access" }),
						destructive: true,
					};
		},
		role: value === "just_me" ? undefined : role,
	};
}
