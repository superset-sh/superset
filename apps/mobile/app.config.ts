import path from "node:path";
import { SUPPORTED_LOCALES } from "@superset/i18n/locales";
import { config } from "dotenv";
import type { ConfigContext } from "expo/config";
import { withIosAccentColor } from "./config-plugins/withIosAccentColor";

// Load .env file
config({
	path: path.resolve(__dirname, "../../.env"),
	override: true,
	quiet: true,
});

export default ({ config }: ConfigContext) => ({
	...config,
	name: "Superset",
	slug: "superset",
	locales: Object.fromEntries(
		SUPPORTED_LOCALES.map((locale) => [locale, `./locales/${locale}.json`]),
	),
	version: "1.0.0",
	orientation: "portrait",
	icon: "./assets/icon.png",
	userInterfaceStyle: "dark",
	scheme: "superset",
	runtimeVersion: { policy: "fingerprint" as const },
	updates: {
		url: "https://u.expo.dev/fa9332a8-896a-4d2a-be5b-d82469b46e5d",
		codeSigningCertificate: "./certs/certificate.pem",
		codeSigningMetadata: { keyid: "main", alg: "rsa-v1_5-sha256" as const },
	},
	ios: {
		supportsTablet: false,
		bundleIdentifier: "sh.superset.mobile",
		usesAppleSignIn: true,
		infoPlist: {
			ITSAppUsesNonExemptEncryption: false,
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
