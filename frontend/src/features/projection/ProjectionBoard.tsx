import { useLayoutEffect, useRef } from "react";
import { formatPassage } from "../../shared/formatting";
import { projectionPage, type ProjectionState } from "./model";
import "./projection.css";

export function ProjectionBoard({ state }: { state: ProjectionState }) {
  const stage = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const passage = projectionPage(state);
  const line = passage ? formatPassage(passage, state.style) : null;
  useLayoutEffect(() => {
    const box = stage.current,
      text = content.current;
    if (!box || !text) return;
    let live = true;
    const fit = () => {
      if (!live) return;
      const ratio = Math.min(box.clientWidth / 1280, box.clientHeight / 720);
      const max = state.style.fontSize * ratio;
      let low = Math.min(8, max),
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
      data-blank={state.blank}
      style={{
        backgroundColor: state.blank ? "#000000" : state.style.backgroundColor,
        color: state.style.textColor,
        textAlign: state.style.alignment,
      }}
    >
      {!state.blank && line && (
        <div ref={content} className="projection-content">
          {line.referenceBefore && (
            <div className="projection-reference">{line.reference}</div>
          )}
          <div className="projection-verses">{line.text}</div>
          {!line.referenceBefore && line.reference && (
            <div className="projection-reference">{line.reference}</div>
          )}
        </div>
      )}
    </div>
  );
}
