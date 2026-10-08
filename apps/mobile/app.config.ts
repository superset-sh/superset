import path from "node:path";
import { SUPPORTED_LOCALES } from "@superset/i18n/locales";
import { IOS_APP } from "@superset/shared/constants";
import { config } from "dotenv";
import type { ConfigContext } from "expo/config";
import { withIosAccentColor } from "./config-plugins/withIosAccentColor";
import { withSceneLifecycle } from "./config-plugins/withSceneLifecycle";

// Load .env file
config({
	path: path.resolve(__dirname, "../../.env"),
	override: true,
	quiet: true,
});

const webUrl = new URL(
	process.env.EXPO_PUBLIC_WEB_URL || "https://app.superset.sh",
);
const associatedDomains =
	webUrl.protocol === "https:" ? [`applinks:${webUrl.hostname}`] : undefined;

const SIGNED_BUILD_PROFILES = ["preview", "production"];
const signedUpdates = process.env.MOBILE_SIGNED_UPDATES === "1";
if (
	!signedUpdates &&
	SIGNED_BUILD_PROFILES.includes(process.env.EAS_BUILD_PROFILE ?? "")
) {
	throw new Error(
		`MOBILE_SIGNED_UPDATES=1 is missing from the ${process.env.EAS_BUILD_PROFILE} EAS environment; refusing to build an unsigned ${process.env.EAS_BUILD_PROFILE} binary`,
	);
}

export default ({ config }: ConfigContext) => ({
	...config,
	name: "Superset",
	slug: "superset",
	locales: Object.fromEntries(
		SUPPORTED_LOCALES.map((locale) => [locale, `./locales/${locale}.json`]),
	),
	version: "1.1.4",
	orientation: "portrait",
	icon: "./assets/icon.png",
	userInterfaceStyle: "dark",
	scheme: "superset",
	runtimeVersion: { policy: "fingerprint" as const },
	updates: {
		url: "https://u.expo.dev/fa9332a8-896a-4d2a-be5b-d82469b46e5d",
		...(signedUpdates && {
			codeSigningCertificate: "./certs/certificate.pem",
			codeSigningMetadata: { keyid: "main", alg: "rsa-v1_5-sha256" as const },
		}),
	},
	ios: {
		supportsTablet: true,
		appleTeamId: IOS_APP.TEAM_ID,
		// Shared with the AgentActivity widget extension: the Live Activity
		// sandbox has no network, so project icons are cached here by the app
		// and read back by the extension from disk.
		entitlements: {
			"com.apple.security.application-groups": ["group.sh.superset.mobile"],
		},
		bundleIdentifier: IOS_APP.BUNDLE_ID,
		...(associatedDomains && { associatedDomains }),
		usesAppleSignIn: true,
		infoPlist: {
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
		package: "sh.superset.mobile",
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
				organization: "superset-sh",
				project: "mobile",
				useNativeInit: true,
				options: {
					dsn: process.env.EXPO_PUBLIC_SENTRY_DSN_MOBILE,
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
		eas: {
			projectId: "fa9332a8-896a-4d2a-be5b-d82469b46e5d",
		},
	},
	owner: "supserset-sh",
});
