import Image from "next/image";
import { avatarUrl } from "@/app/[lang]/utils/avatarUrl";

const SIZE = 32;

export function DeveloperAvatar({ handle }: { handle: string }) {
	return (
		<Image
			src={avatarUrl(handle)}
			alt=""
			width={SIZE}
			height={SIZE}
			unoptimized
			className="size-8 shrink-0 rounded-[2px] bg-foreground/[0.04]"
		/>
	);
}
