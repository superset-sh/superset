import path from "node:path";
import { SUPPORTED_LOCALES } from "@superset/i18n/locales";
import { getIosAppIdentity } from "@superset/shared/constants";
import { mobileAuthProviders } from "@superset/shared/optional-auth-providers";
import { config } from "dotenv";
import type { ConfigContext } from "expo/config";
import { withIosAccentColor } from "./config-plugins/withIosAccentColor";
import { withSceneLifecycle } from "./config-plugins/withSceneLifecycle";

// Load .env file
config({
	path:
		process.env.SUPERSET_BUILD_ENV_FILE ||
		path.resolve(__dirname, "../../.env"),
	override: true,
	quiet: true,
});

const webUrl = new URL(
	process.env.EXPO_PUBLIC_WEB_URL || "https://app.superset.sh",
);
const associatedDomains =
	webUrl.protocol === "https:" ? [`applinks:${webUrl.hostname}`] : undefined;

const SIGNED_BUILD_PROFILES = ["preview", "production"];
const iosApp = getIosAppIdentity();
const upstreamIosApp = getIosAppIdentity({});
const appGroup = `group.${iosApp.BUNDLE_ID}`;
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
const upstreamProjectId = "fa9332a8-896a-4d2a-be5b-d82469b46e5d";
const configuredProjectId = process.env.EAS_PROJECT_ID?.trim() || undefined;
const configuredOwner = process.env.EAS_OWNER?.trim() || undefined;
const selfHost =
	process.env.MOBILE_SELF_HOST === "1" ||
	iosApp.BUNDLE_ID !== upstreamIosApp.BUNDLE_ID ||
	iosApp.TEAM_ID !== upstreamIosApp.TEAM_ID ||
	Boolean(apiUrl && new URL(apiUrl).origin !== "https://api.superset.sh") ||
	Boolean(
		configuredProjectId &&
			configuredProjectId.toLowerCase() !== upstreamProjectId,
	) ||
	Boolean(
		configuredOwner &&
			!["superset-sh", "supserset-sh"].includes(configuredOwner.toLowerCase()),
	);
const updatesEnabled = !selfHost || process.env.MOBILE_UPDATES_ENABLED === "1";
const signedUpdates = process.env.MOBILE_SIGNED_UPDATES === "1";
if (Boolean(configuredProjectId) !== Boolean(configuredOwner)) {
	throw new Error(
		"Set EAS_PROJECT_ID and EAS_OWNER together for an owned Expo project",
	);
}
const projectId =
	configuredProjectId || (selfHost ? undefined : upstreamProjectId);
const owner = configuredOwner || (selfHost ? undefined : "supserset-sh");
if (selfHost) {
	if (
		projectId?.toLowerCase() === upstreamProjectId ||
		["superset-sh", "supserset-sh"].includes(owner?.toLowerCase() ?? "")
	) {
		throw new Error(
			"Self-host builds cannot use the upstream EAS project or account",
		);
	}
	if (updatesEnabled && (!projectId || !owner)) {
		throw new Error(
			"Self-host updates require an owned EAS_PROJECT_ID and EAS_OWNER",
		);
	}
}
if (
	updatesEnabled &&
	!signedUpdates &&
	SIGNED_BUILD_PROFILES.includes(process.env.EAS_BUILD_PROFILE ?? "")
) {
	throw new Error(
		`MOBILE_SIGNED_UPDATES=1 is missing from the ${process.env.EAS_BUILD_PROFILE} EAS environment; refusing to build an unsigned ${process.env.EAS_BUILD_PROFILE} binary`,
	);
}
const updatesCertificate =
	process.env.MOBILE_UPDATES_CERTIFICATE?.trim() || undefined;
if (selfHost && updatesEnabled && signedUpdates && !updatesCertificate) {
	throw new Error(
		"Signed self-host updates require an owned MOBILE_UPDATES_CERTIFICATE",
	);
}
const sentryDsn =
	process.env.EXPO_PUBLIC_SENTRY_DSN_MOBILE?.trim() || undefined;
const usesAppleSignIn = mobileAuthProviders(
	process.env.EXPO_PUBLIC_AUTH_PROVIDERS,
).includes("apple");

export default ({ config }: ConfigContext) => ({
	...config,
	name: process.env.EXPO_PUBLIC_APP_NAME?.trim() || "Superset",
	slug: "superset",
	locales: Object.fromEntries(
		SUPPORTED_LOCALES.map((locale) => [locale, `./locales/${locale}.json`]),
	),
	version: "1.1.3",
	orientation: "portrait",
	icon: "./assets/icon.png",
	userInterfaceStyle: "dark",
	scheme: "superset",
	runtimeVersion: { policy: "fingerprint" as const },
	updates: {
		...(updatesEnabled
			? {
					url: `https://u.expo.dev/${projectId}`,
					...(selfHost && { enabled: true }),
				}
			: { enabled: false }),
		...(updatesEnabled &&
			signedUpdates && {
				codeSigningCertificate: selfHost
					? updatesCertificate
					: "./certs/certificate.pem",
				codeSigningMetadata: { keyid: "main", alg: "rsa-v1_5-sha256" as const },
			}),
	},
	ios: {
		...(process.env.MOBILE_BUILD_NUMBER?.trim() && {
			buildNumber: process.env.MOBILE_BUILD_NUMBER.trim(),
		}),
		supportsTablet: true,
		appleTeamId: iosApp.TEAM_ID,
		// Shared with the AgentActivity widget extension: the Live Activity
		// sandbox has no network, so project icons are cached here by the app
		// and read back by the extension from disk.
		entitlements: {
			"com.apple.security.application-groups": [appGroup],
		},
		bundleIdentifier: iosApp.BUNDLE_ID,
		...(associatedDomains && { associatedDomains }),
		usesAppleSignIn,
		infoPlist: {
			SupersetAppGroup: appGroup,
			"UISupportedInterfaceOrientations~ipad": [
				"UIInterfaceOrientationPortrait",
				"UIInterfaceOrientationPortraitUpsideDown",
				"UIInterfaceOrientationLandscapeLeft",
				"UIInterfaceOrientationLandscapeRight",
			],
			ITSAppUsesNonExemptEncryption: false,
			NSSupportsLiveActivities: true,
			// Voice mode keeps its WebRTC call up with the phone locked.
			UIBackgroundModes: ["audio"],
			// Dictation is native now (`modules/composer`), so no config plugin
			// contributes this any more — `expo-speech-recognition` used to, and
			// went with `GlassComposer`. Without it `SFSpeechRecognizer`'s
			// authorization request terminates the app.
			NSSpeechRecognitionUsageDescription:
				"Superset uses speech recognition to turn your voice into text.",
		},
	},
	android: {
		adaptiveIcon: {
			foregroundImage: "./assets/adaptive-icon.png",
			backgroundColor: "#ffffff",
		},
		package: iosApp.BUNDLE_ID,
		predictiveBackGestureEnabled: false,
	},
	web: {
		favicon: "./assets/favicon.png",
		bundler: "metro",
	},
	plugins: [
		// Dark, not white: iOS 26 fills a prominent system control with the
		// accent, so the photo picker's confirm button became a lit white disc
		// where the rest of that chrome is dark. The composer states its own
		// tint (`ComposerRootView`) rather than inheriting this.
		[withIosAccentColor, { color: "#262626" }],
		// iOS 27 SDK: an app without the UIScene life cycle traps on launch.
		withSceneLifecycle,
		"@bacons/apple-targets",
		"expo-router",
		[
			// The mark on the app background, held until Home has content — see
			// screens/RootLayout. Deliberately the bare mark on transparency:
			// `icon.png` bakes its own ground and square corners the native
			// splash cannot round, which seams against the background.
			"expo-splash-screen",
			{
				backgroundColor: "#0a0a0a",
				image: "./assets/splash-mark.png",
				imageWidth: 200,
				resizeMode: "contain",
			},
		],
		[
			"@sentry/react-native/expo",
			{
				organization: process.env.SENTRY_ORG?.trim() || "superset-sh",
				project: process.env.SENTRY_PROJECT?.trim() || "mobile",
				useNativeInit: Boolean(sentryDsn),
				options: {
					dsn: sentryDsn,
					environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT,
					enableMetricKit: true,
				},
			},
		],
		[
			"expo-localization",
			{ supportedLocales: { ios: [...SUPPORTED_LOCALES] } },
		],
		"expo-apple-authentication",
		[
			"expo-image-picker",
			{
				photosPermission:
					"Superset needs access to your photo library so you can attach images to chat messages.",
				cameraPermission:
					"Superset uses the camera so you can attach photos to chat messages.",
				microphonePermission:
					"Superset uses the microphone so you can dictate chat messages.",
			},
		],
		"expo-document-picker",
		// Listed after expo-image-picker on purpose: both write the microphone
		// string and the last one wins, so this names both uses.
		[
			"@config-plugins/react-native-webrtc",
			{
				cameraPermission:
					"Superset uses the camera so you can attach photos to chat messages.",
				microphonePermission:
					"Superset uses the microphone for voice mode and to dictate chat messages.",
			},
		],
		["expo-notifications", { enableBackgroundRemoteNotifications: false }],
		// The composer is built on Liquid Glass, which silently no-ops before
		// iOS 26 — an iOS 26 floor means one visual language instead of a glass
		// path plus a solid fallback. See plans/20260821-native-composer.md.
		[
			"expo-build-properties",
			{
				ios: { deploymentTarget: "26.0" },
			},
		],
		// SDK 57 no longer autolinks config plugins; every installed plugin has
		// to be listed or its native setup is silently skipped.
		"expo-asset",
		"expo-font",
		"expo-image",
		"expo-secure-store",
		"expo-status-bar",
		"expo-updates",
		"expo-web-browser",
	],
	extra: {
		router: {},
		...(projectId && { eas: { projectId } }),
	},
	owner,
});
