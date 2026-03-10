import {
  supabaseAtom,
  useAuthStateSync,
  useProfileSync,
  setSupabaseForRefresh,
  refreshSessionToken,
  isUnauthorizedError,
} from "@superbuilder/features-client/core/auth";
import { I18nextProvider } from "@superbuilder/features-client/core/i18n";
import { ThemeProvider } from "@superbuilder/features-client/core/theme";
import { PostHogProvider, captureClientError } from "@superbuilder/features-client/core/analytics/client";
import { ErrorBoundary } from "@superbuilder/features-client/core/error/client";
import { configureFileUpload } from "@superbuilder/widgets/file-manager";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  MutationCache,
} from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Provider as JotaiProvider } from "jotai";
import { useHydrateAtoms } from "jotai/utils";
import { Toaster } from "sonner";
import { i18n } from "./lib/feature-i18n";
import { getSupabase } from "./lib/supabase";
import { TRPCProvider, createTRPCQueryClient, API_URL } from "./lib/trpc";
import { createAppRouter } from "./router";

configureFileUpload({ apiUrl: API_URL });

// Supabase 클라이언트를 세션 갱신 유틸에 등록
setSupabaseForRefresh(getSupabase());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error) => {
        // 401 에러는 세션 갱신 후 1회 재시도
        if (isUnauthorizedError(error) && failureCount === 0) return true;
        // 그 외 에러는 기본 재시도 안 함
        return false;
      },
      retryDelay: (failureCount, error) => {
        // 401 에러 시 세션 갱신 대기 후 재시도
        if (isUnauthorizedError(error) && failureCount === 0) {
          refreshSessionToken().then((success) => {
            if (!success) {
              // 갱신 실패 → 로그인 페이지로
              window.location.href = "/sign-in";
            }
          });
          return 1500; // 갱신 완료 대기 시간
        }
        return 0;
      },
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      captureClientError(
        error instanceof Error ? error : new Error(String(error)),
        { source: "query_cache" },
      );
    },
  }),
  mutationCache: new MutationCache({
    onError: async (error) => {
      captureClientError(
        error instanceof Error ? error : new Error(String(error)),
        { source: "mutation_cache" },
      );

      // Mutation 401 에러 시 세션 갱신 시도
      if (isUnauthorizedError(error)) {
        const success = await refreshSessionToken();
        if (!success) {
          window.location.href = "/sign-in";
        }
      }
    },
  }),
});

const trpcClient = createTRPCQueryClient();

const router = createAppRouter(queryClient);

const POSTHOG_API_KEY = import.meta.env.VITE_POSTHOG_API_KEY ?? "";
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";

function HydrateAtoms({ children }: { children: React.ReactNode }) {
  useHydrateAtoms([[supabaseAtom, getSupabase()]]);
  return children;
}

function AuthSync({ children }: { children: React.ReactNode }) {
  useAuthStateSync();
  useProfileSync();
  return children;
}

export function App() {
  return (
    <ErrorBoundary>
      <PostHogProvider apiKey={POSTHOG_API_KEY} host={POSTHOG_HOST}>
        <QueryClientProvider client={queryClient}>
          {/* NOTE: bun이 @trpc/client를 서로 다른 peer-dep 해시로 중복 설치하여
              TRPCProvider와 trpcClient의 nominal 타입이 불일치함. 런타임 동작은 정상. */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <TRPCProvider trpcClient={trpcClient as any} queryClient={queryClient}>
            <JotaiProvider>
              <HydrateAtoms>
                <I18nextProvider i18n={i18n}>
                  <ThemeProvider>
                    <AuthSync>
                      <RouterProvider router={router} />
                      <Toaster position="top-right" richColors />
                    </AuthSync>
                  </ThemeProvider>
                </I18nextProvider>
              </HydrateAtoms>
            </JotaiProvider>
          </TRPCProvider>
        </QueryClientProvider>
      </PostHogProvider>
    </ErrorBoundary>
  );
}
