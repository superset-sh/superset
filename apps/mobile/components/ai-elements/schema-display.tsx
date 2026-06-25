import { useControllableState } from "@rn-primitives/hooks";
import { ChevronRightIcon } from "lucide-react-native";
import { createContext, useContext, useMemo, useState } from "react";
import { View } from "react-native";
import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface SchemaParameter {
	name: string;
	type: string;
	required?: boolean;
	description?: string;
	location?: "path" | "query" | "header";
}

interface SchemaProperty {
	name: string;
	type: string;
	required?: boolean;
	description?: string;
	properties?: SchemaProperty[];
	items?: SchemaProperty;
}

interface SchemaDisplayContextType {
	method: HttpMethod;
	path: string;
	description?: string;
	parameters?: SchemaParameter[];
	requestBody?: SchemaProperty[];
	responseBody?: SchemaProperty[];
}

const SchemaDisplayContext = createContext<SchemaDisplayContextType>({
	method: "GET",
	path: "",
});

const methodContainerStyles: Record<HttpMethod, string> = {
	DELETE: "bg-red-100 dark:bg-red-900/30",
	GET: "bg-green-100 dark:bg-green-900/30",
	PATCH: "bg-yellow-100 dark:bg-yellow-900/30",
	POST: "bg-blue-100 dark:bg-blue-900/30",
	PUT: "bg-orange-100 dark:bg-orange-900/30",
};

const methodTextStyles: Record<HttpMethod, string> = {
	DELETE: "text-red-700 dark:text-red-400",
	GET: "text-green-700 dark:text-green-400",
	PATCH: "text-yellow-700 dark:text-yellow-400",
	POST: "text-blue-700 dark:text-blue-400",
	PUT: "text-orange-700 dark:text-orange-400",
};

const SectionChevron = ({ isOpen }: { isOpen: boolean }) => (
	<View style={isOpen ? { transform: [{ rotate: "90deg" }] } : undefined}>
		<Icon
			as={ChevronRightIcon}
			className="size-4 shrink-0 text-muted-foreground"
		/>
	</View>
);

const RequiredBadge = () => (
	<Badge className="bg-red-100 dark:bg-red-900/30" variant="secondary">
		<Text className="text-red-700 dark:text-red-400">required</Text>
	</Badge>
);

export type SchemaDisplayHeaderProps = React.ComponentProps<typeof View>;

export const SchemaDisplayHeader = ({
	className,
	children,
	...props
}: SchemaDisplayHeaderProps) => (
	<View
		className={cn(
			"flex-row items-center gap-3 border-border border-b px-4 py-3",
			className,
		)}
		{...props}
	>
		{children}
	</View>
);

export type SchemaDisplayMethodProps = React.ComponentProps<typeof Badge>;

export const SchemaDisplayMethod = ({
	className,
	children,
	...props
}: SchemaDisplayMethodProps) => {
	const { method } = useContext(SchemaDisplayContext);

	return (
		<Badge
			className={cn(methodContainerStyles[method], className)}
			variant="secondary"
			{...props}
		>
			{children == null || typeof children === "string" ? (
				<Text className={cn("font-mono text-xs", methodTextStyles[method])}>
					{children ?? method}
				</Text>
			) : (
				children
			)}
		</Badge>
	);
};

const PATH_PARAM_REGEX = /(\{[^}]+\})/;

export type SchemaDisplayPathProps = React.ComponentProps<typeof Text>;

export const SchemaDisplayPath = ({
	className,
	children,
	...props
}: SchemaDisplayPathProps) => {
	const { path } = useContext(SchemaDisplayContext);

	let offset = 0;
	const segments = path.split(PATH_PARAM_REGEX).map((value) => {
		const segment = { key: `${offset}-${value}`, value };
		offset += value.length;
		return segment;
	});

	return (
		<Text className={cn("font-mono text-sm", className)} {...props}>
			{children ??
				segments.map((segment) =>
					segment.value.startsWith("{") ? (
						<Text
							className="font-mono text-blue-600 text-sm dark:text-blue-400"
							key={segment.key}
						>
							{segment.value}
						</Text>
					) : (
						segment.value
					),
				)}
		</Text>
	);
};

export type SchemaDisplayDescriptionProps = React.ComponentProps<typeof View>;

export const SchemaDisplayDescription = ({
	className,
	children,
	...props
}: SchemaDisplayDescriptionProps) => {
	const { description } = useContext(SchemaDisplayContext);

	return (
		<View
			className={cn("border-border border-b px-4 py-3", className)}
			{...props}
		>
			{children == null || typeof children === "string" ? (
				<Text className="text-muted-foreground text-sm">
					{children ?? description}
				</Text>
			) : (
				children
			)}
		</View>
	);
};

export type SchemaDisplayContentProps = React.ComponentProps<typeof View>;

export const SchemaDisplayContent = ({
	className,
	children,
	...props
}: SchemaDisplayContentProps) => (
	<View className={className} {...props}>
		{children}
	</View>
);

export type SchemaDisplayParameterProps = React.ComponentProps<typeof View> &
	SchemaParameter;

export const SchemaDisplayParameter = ({
	name,
	type,
	required,
	description,
	location,
	className,
	...props
}: SchemaDisplayParameterProps) => (
	<View className={cn("px-4 py-3 pl-10", className)} {...props}>
		<View className="flex-row items-center gap-2">
			<Text className="font-mono text-sm">{name}</Text>
			<Badge variant="outline">
				<Text>{type}</Text>
			</Badge>
			{location && (
				<Badge variant="secondary">
					<Text>{location}</Text>
				</Badge>
			)}
			{required && <RequiredBadge />}
		</View>
		{description && (
			<Text className="mt-1 text-muted-foreground text-sm">{description}</Text>
		)}
	</View>
);

export type SchemaDisplayParametersProps = React.ComponentProps<
	typeof Collapsible
>;

export const SchemaDisplayParameters = ({
	className,
	children,
	open,
	defaultOpen = true,
	onOpenChange,
	...props
}: SchemaDisplayParametersProps) => {
	const { parameters } = useContext(SchemaDisplayContext);
	const [isOpenState, setIsOpen] = useControllableState<boolean>({
		defaultProp: defaultOpen,
		onChange: onOpenChange,
		prop: open,
	});
	const isOpen = isOpenState ?? false;

	return (
		<Collapsible
			className={className}
			onOpenChange={setIsOpen}
			open={isOpen}
			{...props}
		>
			<CollapsibleTrigger className="w-full flex-row items-center gap-2 px-4 py-3">
				<SectionChevron isOpen={isOpen} />
				<Text className="font-medium text-sm">Parameters</Text>
				<Badge className="ml-auto" variant="secondary">
					<Text>{parameters?.length}</Text>
				</Badge>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<View className="border-border border-t">
					{children ??
						parameters?.map((param) => (
							<SchemaDisplayParameter key={param.name} {...param} />
						))}
				</View>
			</CollapsibleContent>
		</Collapsible>
	);
};

export type SchemaDisplayPropertyProps = React.ComponentProps<typeof View> &
	SchemaProperty & {
		depth?: number;
	};

export const SchemaDisplayProperty = ({
	name,
	type,
	required,
	description,
	properties,
	items,
	depth = 0,
	className,
	...props
}: SchemaDisplayPropertyProps) => {
	const hasChildren = properties || items;
	const paddingLeft = 40 + depth * 16;
	const [isOpen, setIsOpen] = useState(depth < 2);

	if (hasChildren) {
		return (
			<Collapsible onOpenChange={setIsOpen} open={isOpen}>
				<CollapsibleTrigger
					className={cn("w-full flex-row items-center gap-2 py-3", className)}
					style={{ paddingLeft }}
				>
					<SectionChevron isOpen={isOpen} />
					<Text className="font-mono text-sm">{name}</Text>
					<Badge variant="outline">
						<Text>{type}</Text>
					</Badge>
					{required && <RequiredBadge />}
				</CollapsibleTrigger>
				{description && (
					<Text
						className="pb-2 text-muted-foreground text-sm"
						style={{ paddingLeft: paddingLeft + 24 }}
					>
						{description}
					</Text>
				)}
				<CollapsibleContent>
					<View className="border-border border-t">
						{properties?.map((prop) => (
							<SchemaDisplayProperty
								key={prop.name}
								{...prop}
								depth={depth + 1}
							/>
						))}
						{items && (
							<SchemaDisplayProperty
								{...items}
								depth={depth + 1}
								name={`${name}[]`}
							/>
						)}
					</View>
				</CollapsibleContent>
			</Collapsible>
		);
	}

	return (
		<View
			className={cn("py-3 pr-4", className)}
			style={{ paddingLeft }}
			{...props}
		>
			<View className="flex-row items-center gap-2">
				<View className="size-4" />
				<Text className="font-mono text-sm">{name}</Text>
				<Badge variant="outline">
					<Text>{type}</Text>
				</Badge>
				{required && <RequiredBadge />}
			</View>
			{description && (
				<Text className="mt-1 pl-6 text-muted-foreground text-sm">
					{description}
				</Text>
			)}
		</View>
	);
};

export type SchemaDisplayRequestProps = React.ComponentProps<
	typeof Collapsible
>;

export const SchemaDisplayRequest = ({
	className,
	children,
	open,
	defaultOpen = true,
	onOpenChange,
	...props
}: SchemaDisplayRequestProps) => {
	const { requestBody } = useContext(SchemaDisplayContext);
	const [isOpenState, setIsOpen] = useControllableState<boolean>({
		defaultProp: defaultOpen,
		onChange: onOpenChange,
		prop: open,
	});
	const isOpen = isOpenState ?? false;

	return (
		<Collapsible
			className={className}
			onOpenChange={setIsOpen}
			open={isOpen}
			{...props}
		>
			<CollapsibleTrigger className="w-full flex-row items-center gap-2 px-4 py-3">
				<SectionChevron isOpen={isOpen} />
				<Text className="font-medium text-sm">Request Body</Text>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<View className="border-border border-t">
					{children ??
						requestBody?.map((prop) => (
							<SchemaDisplayProperty key={prop.name} {...prop} depth={0} />
						))}
				</View>
			</CollapsibleContent>
		</Collapsible>
	);
};

export type SchemaDisplayResponseProps = React.ComponentProps<
	typeof Collapsible
>;

export const SchemaDisplayResponse = ({
	className,
	children,
	open,
	defaultOpen = true,
	onOpenChange,
	...props
}: SchemaDisplayResponseProps) => {
	const { responseBody } = useContext(SchemaDisplayContext);
	const [isOpenState, setIsOpen] = useControllableState<boolean>({
		defaultProp: defaultOpen,
		onChange: onOpenChange,
		prop: open,
	});
	const isOpen = isOpenState ?? false;

	return (
		<Collapsible
			className={className}
			onOpenChange={setIsOpen}
			open={isOpen}
			{...props}
		>
			<CollapsibleTrigger className="w-full flex-row items-center gap-2 px-4 py-3">
				<SectionChevron isOpen={isOpen} />
				<Text className="font-medium text-sm">Response</Text>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<View className="border-border border-t">
					{children ??
						responseBody?.map((prop) => (
							<SchemaDisplayProperty key={prop.name} {...prop} depth={0} />
						))}
				</View>
			</CollapsibleContent>
		</Collapsible>
	);
};

export type SchemaDisplayProps = React.ComponentProps<typeof View> & {
	method: HttpMethod;
	path: string;
	description?: string;
	parameters?: SchemaParameter[];
	requestBody?: SchemaProperty[];
	responseBody?: SchemaProperty[];
};

export const SchemaDisplay = ({
	method,
	path,
	description,
	parameters,
	requestBody,
	responseBody,
	className,
	children,
	...props
}: SchemaDisplayProps) => {
	const contextValue = useMemo(
		() => ({
			description,
			method,
			parameters,
			path,
			requestBody,
			responseBody,
		}),
		[description, method, parameters, path, requestBody, responseBody],
	);

	return (
		<SchemaDisplayContext.Provider value={contextValue}>
			<View
				className={cn(
					"overflow-hidden rounded-lg border border-border bg-background",
					className,
				)}
				{...props}
			>
				{children ?? (
					<>
						<SchemaDisplayHeader>
							<View className="flex-row items-center gap-3">
								<SchemaDisplayMethod />
								<SchemaDisplayPath />
							</View>
						</SchemaDisplayHeader>
						{description && <SchemaDisplayDescription />}
						<SchemaDisplayContent>
							{parameters && parameters.length > 0 && (
								<SchemaDisplayParameters />
							)}
							{requestBody && requestBody.length > 0 && (
								<SchemaDisplayRequest />
							)}
							{responseBody && responseBody.length > 0 && (
								<SchemaDisplayResponse />
							)}
						</SchemaDisplayContent>
					</>
				)}
			</View>
		</SchemaDisplayContext.Provider>
	);
};

export type SchemaDisplayBodyProps = React.ComponentProps<typeof View>;

export const SchemaDisplayBody = ({
	className,
	children,
	...props
}: SchemaDisplayBodyProps) => (
	<View className={className} {...props}>
		{children}
	</View>
);

export type SchemaDisplayExampleProps = React.ComponentProps<typeof View>;

export const SchemaDisplayExample = ({
	className,
	children,
	...props
}: SchemaDisplayExampleProps) => (
	<View
		className={cn("mx-4 mb-4 rounded-md bg-muted p-4", className)}
		{...props}
	>
		{typeof children === "string" ? (
			<Text className="font-mono text-sm">{children}</Text>
		) : (
			children
		)}
	</View>
);
