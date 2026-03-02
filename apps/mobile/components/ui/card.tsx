import { View, type ViewProps } from "react-native";
import { Text, TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: ViewProps & React.RefAttributes<View>) {
	return (
		<TextClassContext.Provider value="text-card-foreground">
			<View
				className={cn(
					"bg-card border-border flex flex-col gap-6 rounded-xl border py-6 shadow-sm shadow-black/5",
					className,
				)}
				{...props}
			/>
		</TextClassContext.Provider>
	);
}

function CardHeader({
	className,
	...props
}: ViewProps & React.RefAttributes<View>) {
	return (
		<View className={cn("flex flex-col gap-1.5 px-6", className)} {...props} />
	);
}

function CardTitle({
	className,
	...props
}: React.ComponentProps<typeof Text> & React.RefAttributes<Text>) {
	return (
		<Text
			role="heading"
			aria-level={3}
			className={cn("font-semibold leading-none", className)}
			{...props}
		/>
	);
}

function CardDescription({
	className,
	...props
}: React.ComponentProps<typeof Text> & React.RefAttributes<Text>) {
	return (
		<Text
			className={cn("text-muted-foreground text-sm", className)}
			{...props}
		/>
	);
}

function CardContent({
	className,
	...props
}: ViewProps & React.RefAttributes<View>) {
	return <View className={cn("px-6", className)} {...props} />;
}

function CardFooter({
	className,
	...props
}: ViewProps & React.RefAttributes<View>) {
	return (
		<View
			className={cn("flex flex-row items-center px-6", className)}
			{...props}
		/>
	);
}

export {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
};
