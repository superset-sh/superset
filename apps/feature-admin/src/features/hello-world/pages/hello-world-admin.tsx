import { useEffect, useState } from "react";
import { Globe, RefreshCw, Server, Sparkles, Zap } from "lucide-react";
import { API_URL } from "@/lib/trpc";

const REST_API_URL = `${API_URL}/api`;
const TRPC_URL = `${API_URL}/trpc`;

/**
 * tRPC HTTP 호출 헬퍼
 * tRPC query는 GET 요청으로 호출 가능
 */
async function trpcQuery<T>(procedure: string, input?: unknown): Promise<T> {
  const url = new URL(`${TRPC_URL}/${procedure}`);
  if (input !== undefined) {
    url.searchParams.set("input", JSON.stringify(input));
  }
  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || "tRPC Error");
  }
  return json.result.data;
}

interface ApiState {
  rest: { hello: string | null; greet: string | null };
  trpc: { hello: string | null; greet: string | null };
  loading: boolean;
  error: string | null;
}

function useHelloWorldApi() {
  const [state, setState] = useState<ApiState>({
    rest: { hello: null, greet: null },
    trpc: { hello: null, greet: null },
    loading: true,
    error: null,
  });

  const fetchData = async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const [restHello, restGreet, trpcHello, trpcGreet] = await Promise.all([
        // REST API
        fetch(`${REST_API_URL}/hello-world`).then((res) => res.text()),
        fetch(`${REST_API_URL}/hello-world/greet?name=Admin`).then((res) => res.text()),
        // tRPC (HTTP 직접 호출)
        trpcQuery<{ message: string }>("helloWorld.hello"),
        trpcQuery<{ message: string }>("helloWorld.greet", { name: "Admin" }),
      ]);

      setState({
        rest: { hello: restHello, greet: restGreet },
        trpc: { hello: trpcHello.message, greet: trpcGreet.message },
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to fetch",
      }));
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return { ...state, refetch: fetchData };
}

export function HelloWorldAdmin() {
  const { rest, trpc, loading, error, refetch } = useHelloWorldApi();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5" />
          <h1 className="text-xl font-bold">Hello World</h1>
        </div>
        <button
          onClick={refetch}
          disabled={loading}
          className="hover:bg-accent flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <p className="text-muted-foreground">서버 API 연동 테스트 (REST API + tRPC)</p>

      {/* Error */}
      {error && (
        <div className="border-destructive/50 bg-destructive/10 text-destructive rounded-md border p-4">
          <p className="text-sm font-medium">Error: {error}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            서버가 실행 중인지 확인하세요
          </p>
        </div>
      )}

      {/* REST API Results */}
      <div className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Server className="size-4" />
          REST API (/api/hello-world)
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-4">
            <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm">
              <Globe className="size-3" />
              GET /api/hello-world
            </div>
            {loading ? (
              <div className="bg-muted h-6 w-48 animate-pulse rounded" />
            ) : (
              <p className="font-mono text-sm">{rest.hello ?? "No response"}</p>
            )}
          </div>

          <div className="rounded-lg border p-4">
            <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm">
              <Globe className="size-3" />
              GET /api/hello-world/greet?name=Admin
            </div>
            {loading ? (
              <div className="bg-muted h-6 w-48 animate-pulse rounded" />
            ) : (
              <p className="font-mono text-sm">{rest.greet ?? "No response"}</p>
            )}
          </div>
        </div>
      </div>

      {/* tRPC Results */}
      <div className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Zap className="size-4" />
          tRPC (/trpc/helloWorld)
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-4">
            <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm">
              <Zap className="size-3" />
              helloWorld.hello
            </div>
            {loading ? (
              <div className="bg-muted h-6 w-48 animate-pulse rounded" />
            ) : (
              <p className="font-mono text-sm">{trpc.hello ?? "No response"}</p>
            )}
          </div>

          <div className="rounded-lg border p-4">
            <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm">
              <Zap className="size-3" />
              {`helloWorld.greet({ name: "Admin" })`}
            </div>
            {loading ? (
              <div className="bg-muted h-6 w-48 animate-pulse rounded" />
            ) : (
              <p className="font-mono text-sm">{trpc.greet ?? "No response"}</p>
            )}
          </div>
        </div>
      </div>

      {/* tRPC React Query Info */}
      <div className="text-muted-foreground rounded-lg border border-dashed p-4">
        <p className="text-sm">
          <strong>tRPC React Query:</strong> App에서{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">useTRPC()</code> 훅을 사용하여 자동
          캐싱, 재검증 등의 기능을 활용할 수 있습니다.
        </p>
        <pre className="bg-muted mt-2 overflow-x-auto rounded p-2 text-xs">
          {`// App에서 사용 예시
const trpc = useTRPC();
const hello = trpc.helloWorld.hello.useQuery();
const greet = trpc.helloWorld.greet.useQuery({ name: "Admin" });`}
        </pre>
      </div>
    </div>
  );
}
