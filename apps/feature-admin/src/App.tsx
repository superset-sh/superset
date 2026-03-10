import {
  supabaseAtom,
  useAuthStateSync,
  useProfileSync,
  setSupabaseForRefresh,
  refreshSessionToken,
  isUnauthorizedError,
} from "@superbuilder/features-client/core/auth";
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
import { getSupabase } from "./lib/supabase";
import { TRPCProvider, createTRPCQueryClient, API_URL } from "./lib/trpc";
import { createAppRouter } from "./router";

configureFileUpload({ apiUrl: API_URL });
// i18n 초기화
import "./lib/feature-i18n";

// Supabase 클라이언트를 세션 갱신 유틸에 등록
setSupabaseForRefresh(getSupabase());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: (failureCount, error) => {
        if (isUnauthorizedError(error) && failureCount === 0) return true;
        return false;
      },
      retryDelay: (failureCount, error) => {
        if (isUnauthorizedError(error) && failureCount === 0) {
          refreshSessionToken().then((success) => {
            if (!success) {
              window.location.href = "/admin/login";
            }
          });
          return 1500;
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

      if (isUnauthorizedError(error)) {
        const success = await refreshSessionToken();
        if (!success) {
          window.location.href = "/admin/login";
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
          <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
            <JotaiProvider>
              <HydrateAtoms>
                <ThemeProvider>
                  <AuthSync>
                    <RouterProvider router={router} />
                    <Toaster position="top-right" richColors />
                  </AuthSync>
                </ThemeProvider>
              </HydrateAtoms>
            </JotaiProvider>
          </TRPCProvider>
        </QueryClientProvider>
      </PostHogProvider>
    </ErrorBoundary>
  );
}
