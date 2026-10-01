import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import { cn } from "@superset/ui/utils";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";

interface CloudWorkspacePersonLinkProps {
	person: NonNullable<CloudWorkspaceRow["createdBy"]>;
	avatarSize?: number;
	showAvatar?: boolean;
	className?: string;
	onOpen: (userId: string) => void;
}

export function CloudWorkspacePersonLink({
	person,
	avatarSize = 18,
	showAvatar = true,
	className,
	onOpen,
}: CloudWorkspacePersonLinkProps) {
	return (
		<button
			type="button"
			onClick={() => onOpen(person.userId)}
			className={cn(
				"inline-flex h-[1lh] items-center gap-1.5 rounded-sm px-1 align-top font-medium text-foreground hover:bg-fill-hover focus-visible:bg-fill-hover focus-visible:outline-none",
				className,
			)}
		>
			{showAvatar && (
				<AvatarStack
					people={[
						{ id: person.userId, name: person.name, image: person.image },
					]}
					size={avatarSize}
				/>
			)}
			{person.name}
		</button>
	);
}
