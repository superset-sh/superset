import { useEffect } from "react";
import { useMounted } from "./use-mounted";

export function useEffectOnce(callback: React.EffectCallback) {
  const mounted = useMounted();

  useEffect(() => {
    if (mounted) {
      callback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);
}
