import DOMPurify from "dompurify";
import { useEffect, useRef, useState } from "react";

interface MermaidDiagramProps {
  code: string;
  title?: string;
  className?: string;
}

let mermaidInitialized = false;
let mermaidModule: typeof import("mermaid") | null = null;

async function getMermaid() {
  if (!mermaidModule) {
    mermaidModule = await import("mermaid");
  }
  if (!mermaidInitialized) {
    mermaidModule.default.initialize({
      startOnLoad: false,
      theme: "neutral",
      securityLevel: "strict",
      fontFamily: "inherit",
    });
    mermaidInitialized = true;
  }
  return mermaidModule.default;
}

/**
 * Mermaid 코드를 SVG로 렌더링하는 컴포넌트.
 * 렌더링 실패 시 raw 코드를 fallback으로 표시.
 */
export function MermaidDiagram({ code, title, className }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const idRef = useRef(`mermaid-${crypto.randomUUID().slice(0, 8)}`);

  useEffect(() => {
    if (!code || !containerRef.current) return;

    let cancelled = false;

    async function render() {
      setLoading(true);
      setError(null);

      try {
        const mermaid = await getMermaid();
        const { svg } = await mermaid.render(idRef.current, code);
        const sanitized = DOMPurify.sanitize(svg, {
          USE_PROFILES: { svg: true, svgFilters: true },
          ADD_TAGS: ["foreignObject"],
        });

        if (!cancelled && containerRef.current) {
          containerRef.current.textContent = "";
          const wrapper = document.createElement("div");
          wrapper.innerHTML = DOMPurify.sanitize(sanitized, {
            USE_PROFILES: { svg: true, svgFilters: true },
            ADD_TAGS: ["foreignObject"],
          });
          const svgEl = wrapper.firstElementChild;
          if (svgEl) {
            containerRef.current.appendChild(svgEl);
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }

    render();

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className={className}>
        {title ? (
          <p className="mb-2 text-sm font-medium text-muted-foreground">{title}</p>
        ) : null}
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="mb-2 text-xs text-destructive">다이어그램 렌더링 실패</p>
          <pre className="overflow-x-auto text-xs text-muted-foreground">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {title ? (
        <p className="mb-2 text-sm font-medium text-muted-foreground">{title}</p>
      ) : null}
      <div className="relative rounded-lg border bg-background p-4">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : null}
        <div
          ref={containerRef}
          className={`overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full ${loading ? "hidden" : ""}`}
        />
      </div>
    </div>
  );
}
