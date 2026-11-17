import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface SelectionAnchor {
  x: number;
  y: number;
  top: number;
  element: HTMLElement;
}

export function SelectionToolbar({
  anchor,
  label,
  onDismiss,
  children,
}: {
  anchor: SelectionAnchor;
  label: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const toolbar = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    let placeBelow: boolean | undefined;
    const update = () => {
      if (!toolbar.current || !anchor.element.isConnected) return onDismiss();
      const rect = anchor.element.getBoundingClientRect();
      const viewport = anchor.element
        .closest(".verse-scroll")!
        .getBoundingClientRect();
      if (rect.bottom <= viewport.top || rect.top >= viewport.bottom)
        return onDismiss();
      const { width, height } = toolbar.current.getBoundingClientRect();
      const x = anchor.x;
      const y = Math.max(
        viewport.top,
        Math.min(viewport.bottom, anchor.y + rect.top - anchor.top),
      );
      const left = Math.max(
        8,
        Math.min(window.innerWidth - width - 8, x - width / 2),
      );
      if (placeBelow === undefined)
        placeBelow = y + height + 20 <= window.innerHeight;
      if (placeBelow && y + height + 20 > window.innerHeight)
        placeBelow = false;
      if (!placeBelow && y - height - 12 < 8) placeBelow = true;
      const preferred = placeBelow ? y + 12 : y - height - 12;
      const top = Math.max(
        8,
        Math.min(window.innerHeight - height - 8, preferred),
      );
      setPosition({ left, top });
    };
    update();
    const observer = new ResizeObserver(update);
    if (toolbar.current) observer.observe(toolbar.current);
    observer.observe(anchor.element);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchor, onDismiss]);
  return (
    <div
      ref={toolbar}
      className="selection-toolbar"
      role="toolbar"
      aria-label={label}
      style={position}
      onMouseDown={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}
