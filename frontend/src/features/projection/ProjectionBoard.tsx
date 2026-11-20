import { useLayoutEffect, useRef } from "react";
import { formatPassage } from "../../shared/formatting";
import { projectionPages, type ProjectionState } from "./model";
import { projectionThemes } from "./themes";
import "./projection.css";

export function ProjectionBoard({ state }: { state: ProjectionState }) {
  const stage = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const lines = projectionPages(state).map((passage) =>
    formatPassage(passage, state.style),
  );
  const theme = projectionThemes.find((t) => t.id === state.style.themeId);
  useLayoutEffect(() => {
    const box = stage.current,
      text = content.current;
    if (!box || !text) return;
    let live = true;
    const fit = () => {
      if (!live) return;
      const ratio = Math.min(box.clientWidth / 1280, box.clientHeight / 720);
      const max = state.style.fontSize * ratio;
      // The lower bound scales with the logical slide, including small previews.
      let low = Math.min(0.5 * ratio, max),
        high = max;
      for (let i = 0; i < 12; i++) {
        const size = (low + high) / 2;
        text.style.fontSize = size + "px";
        if (
          text.scrollHeight <= box.clientHeight * 0.84 &&
          text.scrollWidth <= text.clientWidth + 1
        )
          low = size;
        else high = size;
      }
      text.style.fontSize = low + "px";
    };
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    fit();
    void document.fonts.ready.then(fit);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [state]);
  return (
    <div
      ref={stage}
      className="projection-board"
      data-theme={state.style.themeId || "custom"}
      data-blank={state.blank}
      style={{
        backgroundColor: state.blank ? "#000000" : state.style.backgroundColor,
        color: state.style.textColor,
        textAlign: state.style.alignment,
        fontFamily:
          theme?.font === "serif"
            ? '"Noto Serif CJK SC", "Songti SC", SimSun, serif'
            : '"Bible Sans", sans-serif',
      }}
    >
      {!state.blank && lines.length > 0 && (
        <div
          ref={content}
          className="projection-content"
          style={{ lineHeight: theme?.lineHeight || 1.5 }}
        >
          {lines.map((line, index) => (
            <section className="projection-passage" key={index}>
              {line.referenceBefore && (
                <div className="projection-reference">{line.reference}</div>
              )}
              <div className="projection-verses">{line.text}</div>
              {!line.referenceBefore && line.reference && (
                <div className="projection-reference">{line.reference}</div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
