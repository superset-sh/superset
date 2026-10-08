import type { Button } from "@expo/ui/swift-ui";
import type { LucideIcon } from "lucide-react-native";
import type { ComponentProps } from "react";

export interface GeneralAccessOption {
	value: string;
	label: string;
	description: string;
	icon: LucideIcon;
	/** SF Symbol shown beside the option in the menu. */
	systemImage: ComponentProps<typeof Button>["systemImage"];
}

export interface ShareConfirm {
	title: string;
	message: string;
	action: string;
	destructive?: boolean;
}

export interface GeneralAccess {
	value: string;
	options: GeneralAccessOption[];
	onChange: (next: string) => Promise<unknown>;
	confirm?: (from: string, to: string) => ShareConfirm | null;
	/** What general access lets people do, when the resource has more than one role. */
	role?: { value: string; onChange: (next: string) => Promise<unknown> };
}
