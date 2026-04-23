import { createContext, useContext, type RefObject } from "react";

export type CanvasContextValue = {
  registerNode: (id: string, element: HTMLElement | null) => void;
  getNodeRect: (id: string) => DOMRect | null;
  containerRef: RefObject<HTMLDivElement | null>;
  /** Increments on any observed resize, forcing arrows to re-measure. */
  revision: number;
};

export const CanvasContext = createContext<CanvasContextValue | null>(null);

export const useCanvasContext = (): CanvasContextValue => {
  const context = useContext(CanvasContext);
  if (!context) {
    throw new Error("Arrow components must be used inside <ArrowCanvas>");
  }
  return context;
};
