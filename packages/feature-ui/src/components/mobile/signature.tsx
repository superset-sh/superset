import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";

interface SignatureProps {
  onChange: (signature: string) => void;
  placeholder?: string;
  height?: number;
  className?: string;
}

type SigCanvasEx = SignatureCanvas & {
  getCanvas(): HTMLCanvasElement;
  getTrimmedCanvas(): HTMLCanvasElement;
};

export function Signature({
  onChange,
  placeholder = "여기에 서명해주세요",
  height = 180,
  className,
}: SignatureProps) {
  const sigRef = useRef<SigCanvasEx>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [signature, setSignature] = useState("");
  const [hasStarted, setHasStarted] = useState(false);

  /** 캔버스 해상도 초기화 */
  const resizeCanvas = () => {
    const canvas = sigRef.current?.getCanvas();
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const cssWidth = container.clientWidth;

    canvas.width = cssWidth * ratio;
    canvas.height = height * ratio;

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      if (typeof ctx.setTransform === "function") {
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      } else {
        ctx.resetTransform?.();
        ctx.scale(ratio, ratio);
      }
    }
  };

  useEffect(() => {
    resizeCanvas();

    const observer = new ResizeObserver(() => resizeCanvas());
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [height]);

  const handleClear = () => {
    sigRef.current?.clear();
    setSignature("");
    setHasStarted(false);
    onChange("");
  };

  const handleBegin = () => {
    setHasStarted(true);
  };

  const handleEnd = () => {
    const canvas = sigRef.current?.getCanvas();
    const dataUrl = canvas?.toDataURL("image/png") ?? "";
    setSignature(dataUrl);
    onChange(dataUrl);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full rounded-xl bg-muted ${className ?? ""}`}
      style={{ height }}
    >
      <SignatureCanvas
        ref={sigRef}
        penColor="black"
        {...(({
          minWidth: 2,
          maxWidth: 2,
          dotSize: 2,
          throttle: 0,
          velocityFilterWeight: 0.7,
          minDistance: 0,
        }) as any)}
        onBegin={handleBegin}
        onEnd={handleEnd}
        canvasProps={{
          width: 1,
          height: 1,
          style: { backgroundColor: "transparent", touchAction: "none" },
        }}
      />

      {!signature && !hasStarted ? (
        <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-medium leading-6 text-muted-foreground">
          {placeholder}
        </p>
      ) : null}

      <Button
        variant="ghost"
        size="icon"
        className="absolute bottom-3 right-3 z-10 size-12 rounded-full bg-background"
        onClick={handleClear}
      >
        <RotateCw className="size-6" />
      </Button>
    </div>
  );
}
