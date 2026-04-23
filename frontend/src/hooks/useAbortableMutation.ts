import { useCallback, useRef } from 'react';
import { useMutation, type UseMutationOptions, type UseMutationResult } from '@tanstack/react-query';

/** axios CanceledError / fetch AbortError 를 조용히 무시하도록 감싼 useMutation. */
export function useAbortableMutation<TData, TError, TVariables, TContext = unknown>(
  options: Omit<UseMutationOptions<TData, TError, TVariables, TContext>, 'mutationFn'> & {
    mutationFn: (variables: TVariables, signal: AbortSignal) => Promise<TData>;
  },
): UseMutationResult<TData, TError, TVariables, TContext> & {
  abort: () => void;
  signal: AbortSignal | null;
} {
  const ctrlRef = useRef<AbortController | null>(null);

  const { mutationFn, onError, onSettled, ...rest } = options;

  const wrappedFn = useCallback(async (vars: TVariables): Promise<TData> => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    return mutationFn(vars, ctrl.signal);
  }, [mutationFn]);

  const mut = useMutation<TData, TError, TVariables, TContext>({
    ...rest,
    mutationFn: wrappedFn,
    onError: (...args) => {
      // 사용자 취소면 에러 무음 처리
      const e = args[0] as unknown as { name?: string; code?: string };
      if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED' || e?.name === 'AbortError') {
        return;
      }
      (onError as ((...a: unknown[]) => unknown) | undefined)?.(...args);
    },
    onSettled: (...args) => {
      ctrlRef.current = null;
      (onSettled as ((...a: unknown[]) => unknown) | undefined)?.(...args);
    },
  });

  const abort = useCallback(() => {
    ctrlRef.current?.abort();
    ctrlRef.current = null;
  }, []);

  return {
    ...mut,
    abort,
    get signal() { return ctrlRef.current?.signal ?? null; },
  };
}
