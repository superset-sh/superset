import { useState } from "react";

const handlers = {
  initial: <T>(initialData: T | null = null): AsyncState<T> => ({
    data: initialData,
    error: null,
    idle: true,
    loading: false,
    succeeded: false,
    failed: false,
  }),
  load: <T>(initialData: T | null = null): AsyncState<T> => ({
    data: initialData,
    error: null,
    idle: false,
    loading: true,
    succeeded: false,
    failed: false,
  }),
  success: <T>(data: T): AsyncState<T> => ({
    data,
    error: null,
    idle: false,
    loading: false,
    succeeded: true,
    failed: false,
  }),
  error: <T>(error: Error): AsyncState<T> => ({
    error,
    data: null,
    idle: false,
    loading: false,
    succeeded: false,
    failed: true,
  }),
};

interface Options<T> {
  initialData?: T;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export function useAsync<TArguments extends unknown[], TData>(
  asyncFn: (...args: TArguments) => Promise<TData>,
  { initialData, onSuccess, onError }: Options<TData> = {},
) {
  const [state, setState] = useState<AsyncState<TData>>(handlers.initial(initialData));

  const execute = async (...args: TArguments) => {
    console.log("execute =>", args);
    setState(handlers.load(state.data));

    try {
      const result = await asyncFn(...args);
      setState(handlers.success(result));
      onSuccess?.(result);
    } catch (error) {
      setState(handlers.error(error as Error));
      onError?.(error as Error);
    }
  };

  const reset = () => {
    setState(handlers.initial(initialData));
  };

  return {
    ...state,
    execute,
    reset,
  };
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  idle: boolean;
  loading: boolean;
  succeeded: boolean;
  failed: boolean;
}
