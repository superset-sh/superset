export type AuthUiVariant = 1 | 2 | 3 | 4 | 5;

export type OAuthProvider = "google" | "naver" | "kakao";
export type AuthProvider = "email" | OAuthProvider;

export interface OAuthProviderConfig {
  label: string;
  labelEn: string;
  bgColor: string;
  textColor: string;
  supabaseNative: boolean;
}

export const OAUTH_PROVIDER_CONFIG: Record<OAuthProvider, OAuthProviderConfig> = {
  google: {
    label: "Google로 계속",
    labelEn: "Continue with Google",
    bgColor: "bg-white border border-input",
    textColor: "text-foreground",
    supabaseNative: true,
  },
  kakao: {
    label: "카카오로 계속",
    labelEn: "Continue with Kakao",
    bgColor: "bg-[#FEE500]",
    textColor: "text-[#191919]",
    supabaseNative: true,
  },
  naver: {
    label: "네이버로 계속",
    labelEn: "Continue with Naver",
    bgColor: "bg-[#03C75A]",
    textColor: "text-white",
    supabaseNative: false,
  },
};

const ENABLED_PROVIDERS: AuthProvider[] = (
  (import.meta.env.VITE_AUTH_PROVIDERS ?? "email") as string
)
  .split(",")
  .map((p: string) => p.trim())
  .filter(Boolean) as AuthProvider[];

export function getEnabledOAuthProviders(): OAuthProvider[] {
  return ENABLED_PROVIDERS.filter((p): p is OAuthProvider => p !== "email");
}

export function isProviderEnabled(provider: AuthProvider): boolean {
  return ENABLED_PROVIDERS.includes(provider);
}

export const authConfig = {
  uiVariant: 4 as AuthUiVariant,
} as const;
