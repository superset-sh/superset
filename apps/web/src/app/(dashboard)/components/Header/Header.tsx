"use client";

import { authClient } from "@superset/auth/client";
import { getInitials } from "@superset/shared/names";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function Header() {
	const { data: session } = authClient.useSession();
	const router = useRouter();

	const user = session?.user;
	const initials = getInitials(user?.name, user?.email);

	const handleSignOut = async () => {
		await authClient.signOut();
		router.push("/sign-in");
	};

	return (
		<header className="sticky left-0 top-0 z-40 w-full border-b border-border/50 bg-background py-4">
			<div className="mx-auto flex min-h-8 w-[95vw] max-w-screen-2xl items-center justify-between">
				<Link href="/" aria-label="Go to home">
					<Image
						src="/title.svg"
						alt="Superset"
						width={150}
						height={25}
						priority
					/>
				</Link>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<Avatar className="size-8">
								<AvatarImage
									src={user?.image ?? undefined}
									alt={user?.name ?? ""}
								/>
								<AvatarFallback className="text-xs">{initials}</AvatarFallback>
							</Avatar>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="min-w-56">
						<DropdownMenuLabel>
							<div className="flex flex-col space-y-1">
								<p className="text-sm font-medium">{user?.name}</p>
								<p className="text-xs text-muted-foreground">{user?.email}</p>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="cursor-pointer"
							onClick={handleSignOut}
						>
							<LogOut className="mr-2 size-4" />
							Logout
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</header>
	);
}
