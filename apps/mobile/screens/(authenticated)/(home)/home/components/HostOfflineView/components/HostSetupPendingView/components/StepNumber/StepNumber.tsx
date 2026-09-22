import { Text } from "@/components/ui/text";

export function StepNumber({ step }: { step: number }) {
	return (
		<Text className="text-muted-foreground text-xs font-semibold">{step}</Text>
	);
}
