import {
	ChevronRightIcon,
	FileIcon,
	FolderIcon,
	FolderOpenIcon,
} from "lucide-react-native";
import type { ReactNode } from "react";
import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import { Pressable, View } from "react-native";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Icon } from "@/components/ui/icon";
import { Text, TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";

interface FileTreeContextType {
	expandedPaths: Set<string>;
	togglePath: (path: string) => void;
	selectedPath?: string;
	onSelect?: (path: string) => void;
}

const noop = () => {
	// Default noop for context default value
};

const FileTreeContext = createContext<FileTreeContextType>({
	expandedPaths: new Set(),
	togglePath: noop,
});

export type FileTreeProps = React.ComponentProps<typeof View> & {
	expanded?: Set<string>;
	defaultExpanded?: Set<string>;
	selectedPath?: string;
	onSelect?: (path: string) => void;
	onExpandedChange?: (expanded: Set<string>) => void;
};

export const FileTree = ({
	expanded: controlledExpanded,
	defaultExpanded = new Set(),
	selectedPath,
	onSelect,
	onExpandedChange,
	className,
	children,
	...props
}: FileTreeProps) => {
	const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
	const expandedPaths = controlledExpanded ?? internalExpanded;

	const togglePath = useCallback(
		(path: string) => {
			const newExpanded = new Set(expandedPaths);
			if (newExpanded.has(path)) {
				newExpanded.delete(path);
			} else {
				newExpanded.add(path);
			}
			setInternalExpanded(newExpanded);
			onExpandedChange?.(newExpanded);
		},
		[expandedPaths, onExpandedChange],
	);

	const contextValue = useMemo(
		() => ({ expandedPaths, onSelect, selectedPath, togglePath }),
		[expandedPaths, onSelect, selectedPath, togglePath],
	);

	return (
		<FileTreeContext.Provider value={contextValue}>
			<TextClassContext.Provider value="font-mono text-sm">
				<View
					className={cn(
						"rounded-lg border border-border bg-background",
						className,
					)}
					{...props}
				>
					<View className="p-2">{children}</View>
				</View>
			</TextClassContext.Provider>
		</FileTreeContext.Provider>
	);
};

export type FileTreeIconProps = React.ComponentProps<typeof View>;

export const FileTreeIcon = ({
	className,
	children,
	...props
}: FileTreeIconProps) => (
	<View className={cn("shrink-0", className)} {...props}>
		{children}
	</View>
);

export type FileTreeNameProps = React.ComponentProps<typeof Text>;

export const FileTreeName = ({
	className,
	children,
	...props
}: FileTreeNameProps) => (
	<Text className={cn("shrink", className)} numberOfLines={1} {...props}>
		{children}
	</Text>
);

interface FileTreeFolderContextType {
	path: string;
	name: string;
	isExpanded: boolean;
}

const FileTreeFolderContext = createContext<FileTreeFolderContextType>({
	isExpanded: false,
	name: "",
	path: "",
});

export type FileTreeFolderProps = React.ComponentProps<typeof View> & {
	path: string;
	name: string;
};

export const FileTreeFolder = ({
	path,
	name,
	className,
	children,
	...props
}: FileTreeFolderProps) => {
	const { expandedPaths, togglePath, selectedPath, onSelect } =
		useContext(FileTreeContext);
	const isExpanded = expandedPaths.has(path);
	const isSelected = selectedPath === path;

	const handleOpenChange = useCallback(() => {
		togglePath(path);
	}, [togglePath, path]);

	const handleSelect = useCallback(() => {
		onSelect?.(path);
	}, [onSelect, path]);

	const folderContextValue = useMemo(
		() => ({ isExpanded, name, path }),
		[isExpanded, name, path],
	);

	return (
		<FileTreeFolderContext.Provider value={folderContextValue}>
			<Collapsible onOpenChange={handleOpenChange} open={isExpanded}>
				<View className={className} {...props}>
					<View
						className={cn(
							"w-full flex-row items-center gap-1 rounded px-2 py-1",
							isSelected && "bg-muted",
						)}
					>
						<CollapsibleTrigger className="shrink-0">
							<View
								style={
									isExpanded ? { transform: [{ rotate: "90deg" }] } : undefined
								}
							>
								<Icon
									as={ChevronRightIcon}
									className="size-4 shrink-0 text-muted-foreground"
								/>
							</View>
						</CollapsibleTrigger>
						<Pressable
							className="min-w-0 flex-1 flex-row items-center gap-1"
							onPress={handleSelect}
						>
							<FileTreeIcon>
								<Icon
									as={isExpanded ? FolderOpenIcon : FolderIcon}
									className="size-4 text-blue-500"
								/>
							</FileTreeIcon>
							<FileTreeName>{name}</FileTreeName>
						</Pressable>
					</View>
					<CollapsibleContent>
						<View className="ml-4 border-border border-l pl-2">{children}</View>
					</CollapsibleContent>
				</View>
			</Collapsible>
		</FileTreeFolderContext.Provider>
	);
};

interface FileTreeFileContextType {
	path: string;
	name: string;
}

const FileTreeFileContext = createContext<FileTreeFileContextType>({
	name: "",
	path: "",
});

export type FileTreeFileProps = React.ComponentProps<typeof Pressable> & {
	path: string;
	name: string;
	icon?: ReactNode;
};

export const FileTreeFile = ({
	path,
	name,
	icon,
	className,
	children,
	...props
}: FileTreeFileProps) => {
	const { selectedPath, onSelect } = useContext(FileTreeContext);
	const isSelected = selectedPath === path;

	const handlePress = useCallback(() => {
		onSelect?.(path);
	}, [onSelect, path]);

	const fileContextValue = useMemo(() => ({ name, path }), [name, path]);

	return (
		<FileTreeFileContext.Provider value={fileContextValue}>
			<Pressable
				className={cn(
					"flex-row items-center gap-1 rounded px-2 py-1",
					isSelected && "bg-muted",
					className,
				)}
				onPress={handlePress}
				{...props}
			>
				{children ?? (
					<>
						<View className="size-4 shrink-0" />
						<FileTreeIcon>
							{icon ?? (
								<Icon as={FileIcon} className="size-4 text-muted-foreground" />
							)}
						</FileTreeIcon>
						<FileTreeName>{name}</FileTreeName>
					</>
				)}
			</Pressable>
		</FileTreeFileContext.Provider>
	);
};

export type FileTreeActionsProps = React.ComponentProps<typeof View>;

export const FileTreeActions = ({
	className,
	children,
	...props
}: FileTreeActionsProps) => (
	<View
		className={cn("ml-auto flex-row items-center gap-1", className)}
		{...props}
	>
		{children}
	</View>
);
