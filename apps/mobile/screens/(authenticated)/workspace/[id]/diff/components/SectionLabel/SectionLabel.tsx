import { Text } from "@/components/ui/text";

export function SectionLabel({ children }: { children: string }) {
	return (
		<Text className="text-muted-foreground px-4 pb-2 pt-6 font-semibold text-xs uppercase tracking-wider">
			{children}
		</Text>
	);
}
