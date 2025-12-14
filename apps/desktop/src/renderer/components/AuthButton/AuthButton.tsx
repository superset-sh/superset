import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { FcGoogle } from "react-icons/fc";
import { LuGithub, LuLogOut, LuUser } from "react-icons/lu";
import { useAuth } from "renderer/hooks/useAuth";

/**
 * Authentication button component
 * Shows sign in options when logged out, user menu when logged in
 */
export function AuthButton() {
	const { isSignedIn, isLoading, user, signIn, signOut, isSigningIn } =
		useAuth();

	if (isLoading) {
		return (
			<Button variant="ghost" size="sm" disabled className="no-drag">
				<div className="size-4 animate-pulse rounded-full bg-muted" />
			</Button>
		);
	}

	if (!isSignedIn) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						disabled={isSigningIn}
						className="no-drag"
					>
						{isSigningIn ? "Signing in..." : "Sign in"}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-48">
					<DropdownMenuItem
						onClick={() => signIn("github")}
						className="flex items-center gap-2"
					>
						<LuGithub className="size-4" />
						<span>Continue with GitHub</span>
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={() => signIn("google")}
						className="flex items-center gap-2"
					>
						<FcGoogle className="size-4" />
						<span>Continue with Google</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		);
	}

	const displayName = user?.name ?? "User";
	const displayEmail = user?.email;
	const displayAvatar = user?.avatarUrl;

	const initials = displayName
		.split(" ")
		.map((n) => n[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="no-drag gap-2 px-2">
					<Avatar className="size-6">
						<AvatarImage src={displayAvatar ?? undefined} alt={displayName} />
						<AvatarFallback className="text-xs">
							{initials || <LuUser className="size-3" />}
						</AvatarFallback>
					</Avatar>
					<span className="max-w-24 truncate text-sm">{displayName}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<div className="px-2 py-1.5">
					<p className="text-sm font-medium">{displayName}</p>
					<p className="text-xs text-muted-foreground">{displayEmail}</p>
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={() => signOut()}
					className="flex items-center gap-2 text-destructive focus:text-destructive"
				>
					<LuLogOut className="size-4" />
					<span>Sign out</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
