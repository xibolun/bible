import { useEffect, useState } from "react";
import type { API } from "../../shared/types";
import { emptyProjection, type ProjectionState } from "./model";

export function useProjection(api: API | undefined) {
  const [state, setState] = useState(emptyProjection);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!api) return;
    let live = true;
    const receive = (next: ProjectionState) => {
      if (live)
        setState((current) =>
          next.revision >= current.revision ? next : current,
        );
    };
    const off = api.WatchProjection(receive);
    api
      .GetProjection()
      .then(receive)
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
      off();
    };
  }, [api]);
  return { state, error };
}
