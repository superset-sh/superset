import type { LucideIcon } from "lucide-react-native";
import {
	ArrowRightIcon,
	MinusIcon,
	PackageIcon,
	PlusIcon,
} from "lucide-react-native";
import { createContext, useContext, useMemo } from "react";
import { View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Text, TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type ChangeType = "major" | "minor" | "patch" | "added" | "removed";

interface PackageInfoContextType {
	name: string;
	currentVersion?: string;
	newVersion?: string;
	changeType?: ChangeType;
}

const PackageInfoContext = createContext<PackageInfoContextType>({
	name: "",
});

export type PackageInfoHeaderProps = React.ComponentProps<typeof View>;

export const PackageInfoHeader = ({
	className,
	children,
	...props
}: PackageInfoHeaderProps) => (
	<View
		className={cn("flex-row items-center justify-between gap-2", className)}
		{...props}
	>
		{children}
	</View>
);

export type PackageInfoNameProps = React.ComponentProps<typeof View>;

export const PackageInfoName = ({
	className,
	children,
	...props
}: PackageInfoNameProps) => {
	const { name } = useContext(PackageInfoContext);

	return (
		<View className={cn("flex-row items-center gap-2", className)} {...props}>
			<Icon as={PackageIcon} className="size-4 text-muted-foreground" />
			{children == null || typeof children === "string" ? (
				<Text className="font-medium font-mono text-sm">
					{children ?? name}
				</Text>
			) : (
				children
			)}
		</View>
	);
};

const changeTypeContainerStyles: Record<ChangeType, string> = {
	added: "bg-blue-100 dark:bg-blue-900/30",
	major: "bg-red-100 dark:bg-red-900/30",
	minor: "bg-yellow-100 dark:bg-yellow-900/30",
	patch: "bg-green-100 dark:bg-green-900/30",
	removed: "bg-gray-100 dark:bg-gray-900/30",
};

const changeTypeTextStyles: Record<ChangeType, string> = {
	added: "text-blue-700 dark:text-blue-400",
	major: "text-red-700 dark:text-red-400",
	minor: "text-yellow-700 dark:text-yellow-400",
	patch: "text-green-700 dark:text-green-400",
	removed: "text-gray-700 dark:text-gray-400",
};

const changeTypeIcons: Record<ChangeType, LucideIcon> = {
	added: PlusIcon,
	major: ArrowRightIcon,
	minor: ArrowRightIcon,
	patch: ArrowRightIcon,
	removed: MinusIcon,
};

export type PackageInfoChangeTypeProps = React.ComponentProps<typeof Badge>;

export const PackageInfoChangeType = ({
	className,
	children,
	...props
}: PackageInfoChangeTypeProps) => {
	const { changeType } = useContext(PackageInfoContext);

	if (!changeType) {
		return null;
	}

	return (
		<Badge
			className={cn("gap-1", changeTypeContainerStyles[changeType], className)}
			variant="secondary"
			{...props}
		>
			<Icon
				as={changeTypeIcons[changeType]}
				className={cn("size-3", changeTypeTextStyles[changeType])}
			/>
			{children == null || typeof children === "string" ? (
				<Text className={cn("capitalize", changeTypeTextStyles[changeType])}>
					{children ?? changeType}
				</Text>
			) : (
				children
			)}
		</Badge>
	);
};

export type PackageInfoVersionProps = React.ComponentProps<typeof View>;

export const PackageInfoVersion = ({
	className,
	children,
	...props
}: PackageInfoVersionProps) => {
	const { currentVersion, newVersion } = useContext(PackageInfoContext);

	if (!(currentVersion || newVersion)) {
		return null;
	}

	return (
		<TextClassContext.Provider value="font-mono text-muted-foreground text-sm">
			<View
				className={cn("mt-2 flex-row items-center gap-2", className)}
				{...props}
			>
				{children ?? (
					<>
						{currentVersion && <Text>{currentVersion}</Text>}
						{currentVersion && newVersion && (
							<Icon
								as={ArrowRightIcon}
								className="size-3 text-muted-foreground"
							/>
						)}
						{newVersion && (
							<Text className="font-medium text-foreground">{newVersion}</Text>
						)}
					</>
				)}
			</View>
		</TextClassContext.Provider>
	);
};

export type PackageInfoProps = React.ComponentProps<typeof View> & {
	name: string;
	currentVersion?: string;
	newVersion?: string;
	changeType?: ChangeType;
};

export const PackageInfo = ({
	name,
	currentVersion,
	newVersion,
	changeType,
	className,
	children,
	...props
}: PackageInfoProps) => {
	const contextValue = useMemo(
		() => ({ changeType, currentVersion, name, newVersion }),
		[changeType, currentVersion, name, newVersion],
	);

	return (
		<PackageInfoContext.Provider value={contextValue}>
			<View
				className={cn(
					"rounded-lg border border-border bg-background p-4",
					className,
				)}
				{...props}
			>
				{children ?? (
					<>
						<PackageInfoHeader>
							<PackageInfoName />
							{changeType && <PackageInfoChangeType />}
						</PackageInfoHeader>
						{(currentVersion || newVersion) && <PackageInfoVersion />}
					</>
				)}
			</View>
		</PackageInfoContext.Provider>
	);
};

export type PackageInfoDescriptionProps = React.ComponentProps<typeof Text>;

export const PackageInfoDescription = ({
	className,
	children,
	...props
}: PackageInfoDescriptionProps) => (
	<Text
		className={cn("mt-2 text-muted-foreground text-sm", className)}
		{...props}
	>
		{children}
	</Text>
);

export type PackageInfoContentProps = React.ComponentProps<typeof View>;

export const PackageInfoContent = ({
	className,
	children,
	...props
}: PackageInfoContentProps) => (
	<View
		className={cn("mt-3 border-border border-t pt-3", className)}
		{...props}
	>
		{children}
	</View>
);

export type PackageInfoDependenciesProps = React.ComponentProps<typeof View>;

export const PackageInfoDependencies = ({
	className,
	children,
	...props
}: PackageInfoDependenciesProps) => (
	<View className={cn("gap-2", className)} {...props}>
		<Text className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
			Dependencies
		</Text>
		<View className="gap-1">{children}</View>
	</View>
);

export type PackageInfoDependencyProps = React.ComponentProps<typeof View> & {
	name: string;
	version?: string;
};

export const PackageInfoDependency = ({
	name,
	version,
	className,
	children,
	...props
}: PackageInfoDependencyProps) => (
	<View
		className={cn("flex-row items-center justify-between", className)}
		{...props}
	>
		{children ?? (
			<>
				<Text className="font-mono text-muted-foreground text-sm">{name}</Text>
				{version && <Text className="font-mono text-xs">{version}</Text>}
			</>
		)}
	</View>
);
