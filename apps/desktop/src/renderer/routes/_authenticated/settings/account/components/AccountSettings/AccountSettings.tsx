import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@superset/shared/constants";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@superset/ui/alert-dialog";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { useSignOut } from "renderer/hooks/useSignOut";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	getImageExtensionFromMimeType,
	parseBase64DataUrl,
} from "shared/file-types";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { LeaderboardSection } from "./components/LeaderboardSection";
import { ProfileSkeleton } from "./components/ProfileSkeleton";

interface AccountSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function AccountSettings({ visibleItems }: AccountSettingsProps) {
	const { t } = useLingui();
	const showProfile = isItemVisible(
		SETTING_ITEM_ID.ACCOUNT_PROFILE,
		visibleItems,
	);
	const showSignOut = isItemVisible(
		SETTING_ITEM_ID.ACCOUNT_SIGNOUT,
		visibleItems,
	);
	const showDelete = isItemVisible(
		SETTING_ITEM_ID.ACCOUNT_DELETE,
		visibleItems,
	);
	const showLeaderboard = isItemVisible(
		SETTING_ITEM_ID.ACCOUNT_LEADERBOARD,
		visibleItems,
	);

	const {
		data: session,
		isPending,
		refetch: refetchSession,
	} = authClient.useSession();
	const user = session?.user;

	const [nameValue, setNameValue] = useState("");
	const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

	const signOut = useSignOut();
	const [isDeleting, setIsDeleting] = useState(false);

	const selectImageMutation = electronTrpc.window.selectImageFile.useMutation();

	async function handleDeleteAccount() {
		setIsDeleting(true);
		try {
			await apiTrpcClient.user.deleteAccount.mutate();
			await signOut();
		} catch (error) {
			toast.error(
				errorMessage(
					error,
					t({
						id: "settings.account.deleteAccountFailed",
						message: "Failed to delete account",
					}),
				),
			);
		} finally {
			setIsDeleting(false);
		}
	}

	useEffect(() => {
		if (!user) return;
		setNameValue(user.name ?? "");
		setAvatarPreview(user.image ?? null);
	}, [user]);

	async function handleAvatarUpload() {
		if (!user) return;

		try {
			const result = await selectImageMutation.mutateAsync();
			if (result.canceled || !result.dataUrl) return;

			const { mimeType } = parseBase64DataUrl(result.dataUrl);
			const ext = getImageExtensionFromMimeType(mimeType) ?? "png";

			const uploadResult = await apiTrpcClient.user.uploadAvatar.mutate({
				fileData: result.dataUrl,
				fileName: `avatar.${ext}`,
				mimeType,
			});

			setAvatarPreview(uploadResult.url);
			await refetchSession();
			toast.success(
				t({ id: "settings.account.avatarUpdated", message: "Avatar updated!" }),
			);
		} catch {
			toast.error(
				t({
					id: "settings.account.avatarUpdateFailed",
					message: "Failed to update avatar",
				}),
			);
		}
	}

	async function handleNameBlur() {
		if (!user || nameValue === user.name) return;

		if (!nameValue) {
			setNameValue(user.name ?? "");
			return;
		}

		try {
			await apiTrpcClient.user.updateProfile.mutate({ name: nameValue });
			await refetchSession();
			toast.success(
				t({ id: "settings.account.nameUpdated", message: "Name updated!" }),
			);
		} catch {
			toast.error(
				t({
					id: "settings.account.nameUpdateFailed",
					message: "Failed to update name",
				}),
			);
			setNameValue(user.name ?? "");
		}
	}

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">
					<Trans id="settings.account.title">Account</Trans>
				</h2>
				<p className="text-sm text-muted-foreground mt-1">
					<Trans id="settings.account.subtitle">
						Manage your account settings
					</Trans>
				</p>
			</div>

			<div className="space-y-3">
				{showProfile &&
					(isPending && !user ? (
						<ProfileSkeleton />
					) : user ? (
						<>
							<SettingRow
								label={t({
									id: "settings.account.avatarLabel",
									message: "Avatar",
								})}
								hint={t({
									id: "settings.account.avatarHint",
									message: "Recommended size 256×256.",
								})}
							>
								<button
									type="button"
									onClick={handleAvatarUpload}
									disabled={selectImageMutation.isPending}
									className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-100"
									aria-label={t({
										id: "settings.account.changeAvatarAriaLabel",
										message: "Change avatar",
									})}
								>
									<Avatar
										size="xl"
										fullName={user.name}
										image={avatarPreview}
									/>
								</button>
							</SettingRow>

							<SettingRow
								label={t({ id: "settings.account.nameLabel", message: "Name" })}
							>
								<Input
									value={nameValue}
									onChange={(e) => setNameValue(e.target.value)}
									onBlur={handleNameBlur}
									placeholder={t({
										id: "settings.account.namePlaceholder",
										message: "Your name",
									})}
									className="w-80"
								/>
							</SettingRow>

							<SettingRow
								label={t({
									id: "settings.account.emailLabel",
									message: "Email",
								})}
							>
								<Input
									value={user.email}
									readOnly
									className="w-80 opacity-60"
								/>
							</SettingRow>
						</>
					) : (
						<p className="text-sm text-muted-foreground">
							<Trans id="settings.account.loadError">
								Unable to load user info
							</Trans>
						</p>
					))}

				{showSignOut && (
					<div className={showProfile ? "pt-5" : undefined}>
						<SettingRow
							label={t({
								id: "settings.account.signOutLabel",
								message: "Sign out of this device",
							})}
							hint={t({
								id: "settings.account.signOutHint",
								message:
									"You'll need to sign in again to use Superset on this device.",
							})}
						>
							<Button
								variant="outline"
								onClick={async () => {
									await signOut();
									toast.success(
										t({
											id: "settings.account.signedOut",
											message: "Signed out",
										}),
									);
								}}
							>
								<Trans id="settings.account.signOutButton">Sign out</Trans>
							</Button>
						</SettingRow>
					</div>
				)}

				{showLeaderboard && (
					<div className="pt-5">
						<LeaderboardSection />
					</div>
				)}

				{showDelete && (
					<div className="pt-5">
						<SettingRow
							label={t({
								id: "settings.account.deleteAccountLabel",
								message: "Delete account",
							})}
						>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button variant="destructive" disabled={isDeleting}>
										{isDeleting ? (
											<Trans id="settings.account.deletingButton">
												Deleting…
											</Trans>
										) : (
											<Trans id="settings.account.deleteButton">
												Delete account
											</Trans>
										)}
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>
											<Trans id="settings.account.deleteConfirmTitle">
												Delete account?
											</Trans>
										</AlertDialogTitle>
										<AlertDialogDescription>
											<Trans id="settings.account.deleteConfirmDescription">
												All of your data will be permanently deleted after{" "}
												{ACCOUNT_DELETION_GRACE_DAYS} days — sign back in before
												then to restore your account.
											</Trans>
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>
											<Trans id="settings.account.deleteCancel">Cancel</Trans>
										</AlertDialogCancel>
										<AlertDialogAction
											variant="destructive"
											onClick={handleDeleteAccount}
										>
											<Trans id="settings.account.deleteConfirmAction">
												Delete account
											</Trans>
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</SettingRow>
					</div>
				)}
			</div>
		</div>
	);
}

interface SettingRowProps {
	label: string;
	hint?: string;
	children: React.ReactNode;
}

function SettingRow({ label, hint, children }: SettingRowProps) {
	const searchQuery = useSettingsSearchQuery();

	return (
		<div className="flex items-center justify-between gap-8">
			<div className="flex-1 min-w-0">
				<div className="text-sm font-medium">
					<HighlightText text={label} query={searchQuery} />
				</div>
				{hint && (
					<div className="text-xs text-muted-foreground mt-0.5">
						<HighlightText text={hint} query={searchQuery} />
					</div>
				)}
			</div>
			<div className="flex-shrink-0">{children}</div>
		</div>
	);
}
