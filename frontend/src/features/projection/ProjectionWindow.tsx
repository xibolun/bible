import { useEffect, useState } from "react";
import { getAPI } from "../../shared/api";
import { prototype, type API } from "../../shared/types";
import { ProjectionBoard } from "./ProjectionBoard";
import { useProjection } from "./useProjection";

export function ProjectionWindow() {
  const [api, setAPI] = useState<API>();
  const [error, setError] = useState("");
  const projection = useProjection(api);
  useEffect(() => {
    getAPI()
      .then(setAPI)
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !api ||
        e.isComposing ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      const action = (
        {
          ArrowRight: "next",
          PageDown: "next",
          ArrowLeft: "previous",
          PageUp: "previous",
          b: "blank",
          B: "blank",
        } as Record<string, string>
      )[e.key];
      if (action) {
        e.preventDefault();
        void api.ControlProjection(action).catch((e) => setError(String(e)));
      } else if (["F8", "F11", "Escape"].includes(e.key)) {
        if (!prototype) return; // Native window bindings own these keys.
        e.preventDefault();
        const command =
          e.key === "F8"
            ? "controls"
            : e.key === "F11"
              ? "toggle-fullscreen"
              : "escape";
        void api.ProjectionWindow(command).catch((e) => setError(String(e)));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [api]);
  return (
    <main className="projection-audience" aria-label="经文投影">
      {error || projection.error ? (
        <p role="alert">{error || projection.error}</p>
      ) : (
        <ProjectionBoard state={projection.state} />
      )}
    </main>
  );
}
