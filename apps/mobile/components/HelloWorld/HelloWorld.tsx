import { Sparkles } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type Variant = "default" | "primary" | "destructive";

const VARIANT_CONTAINER: Record<Variant, string> = {
	default: "bg-card border-border",
	primary: "bg-primary border-primary",
	destructive: "bg-destructive border-destructive",
};

const VARIANT_TITLE: Record<Variant, string> = {
	default: "text-card-foreground",
	primary: "text-primary-foreground",
	destructive: "text-destructive-foreground",
};

const VARIANT_SUBTITLE: Record<Variant, string> = {
	default: "text-muted-foreground",
	primary: "text-primary-foreground opacity-80",
	destructive: "text-destructive-foreground opacity-80",
};

const VARIANT_ICON: Record<Variant, string> = {
	default: "text-foreground",
	primary: "text-primary-foreground",
	destructive: "text-destructive-foreground",
};

export type HelloWorldProps = {
	title: string;
	subtitle?: string;
	variant?: Variant;
	showIcon?: boolean;
};

export function HelloWorld({
	title,
	subtitle,
	variant = "default",
	showIcon = false,
}: HelloWorldProps) {
	return (
		<View className={cn("rounded-lg border p-4", VARIANT_CONTAINER[variant])}>
			<View className="flex-row items-center gap-2">
				{showIcon ? (
					<Icon as={Sparkles} className={cn("size-5", VARIANT_ICON[variant])} />
				) : null}
				<Text variant="large" className={VARIANT_TITLE[variant]}>
					{title}
				</Text>
			</View>
			{subtitle ? (
				<Text variant="small" className={cn("mt-1", VARIANT_SUBTITLE[variant])}>
					{subtitle}
				</Text>
			) : null}
		</View>
	);
}
