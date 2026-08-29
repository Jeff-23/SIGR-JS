import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import { useApp } from "../store/app";
export function useResource<T>(path: string, initial: T, interval = 0) {
  const { session, branchId } = useApp();
  const [state, setState] = useState<{
    path: string;
    data: T;
    error: string;
    loading: boolean;
  }>({ path: "", data: initial, error: "", loading: true });
  const [revision, refresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        if (session?.demo) {
          setState({ path, data: initial, error: "", loading: false });
          return;
        }
        const { data } = await api.get<T>(path, { signal: controller.signal });
        if (!controller.signal.aborted)
          setState({ path, data, error: "", loading: false });
      } catch (e) {
        if (!controller.signal.aborted)
          setState({
            path,
            data: initial,
            error: errorMessage(e),
            loading: false,
          });
      } finally {
        busy = false;
      }
    }
    void load();
    const timer = interval
      ? window.setInterval(() => void load(), interval)
      : undefined;
    return () => {
      controller.abort();
      if (timer) clearInterval(timer);
    };
    // Initial is a caller-supplied empty fallback, not a request dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, revision, session?.user.id, session?.demo, branchId, interval]);
  return {
    ...state,
    data: state.path === path ? state.data : initial,
    loading: state.path !== path || state.loading,
    refresh: () => refresh((n) => n + 1),
  };
}
