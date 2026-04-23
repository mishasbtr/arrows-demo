import clsx from "clsx";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { CanvasContext, type CanvasContextValue } from "./context";

type NodeRegistry = {
  registerNode: (id: string, element: HTMLElement | null) => void;
  getNodeRect: (id: string) => DOMRect | null;
  revision: number;
  invalidate: () => void;
};

const useNodeRegistry = (): NodeRegistry => {
  const elementsById = useRef<Map<string, HTMLElement>>(new Map());
  const observersById = useRef<Map<string, ResizeObserver>>(new Map());
  const [revision, setRevision] = useState(0);

  const invalidate = useCallback(() => setRevision(r => r + 1), []);

  const registerNode = useCallback(
    (id: string, element: HTMLElement | null) => {
      if (elementsById.current.get(id) === element) return;

      const previousObserver = observersById.current.get(id);
      if (previousObserver) {
        previousObserver.disconnect();
        observersById.current.delete(id);
      }

      if (element) {
        elementsById.current.set(id, element);
        const observer = new ResizeObserver(invalidate);
        observer.observe(element);
        observersById.current.set(id, observer);
      } else {
        elementsById.current.delete(id);
      }

      invalidate();
    },
    [invalidate],
  );

  const getNodeRect = useCallback((id: string): DOMRect | null => {
    const element = elementsById.current.get(id);
    return element ? element.getBoundingClientRect() : null;
  }, []);

  return { registerNode, getNodeRect, revision, invalidate };
};

export type ArrowCanvasProps = {
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
};

export const ArrowCanvas = ({ children, style, className }: ArrowCanvasProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { registerNode, getNodeRect, revision, invalidate } = useNodeRegistry();

  // Watching the container alone covers viewport-level changes too (zoom,
  // scrollbar appearance), since they propagate to its rendered size.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(invalidate);
    observer.observe(container);
    return () => observer.disconnect();
  }, [invalidate]);

  const contextValue = useMemo<CanvasContextValue>(
    () => ({ registerNode, getNodeRect, containerRef, revision }),
    [registerNode, getNodeRect, revision],
  );

  return (
    <CanvasContext.Provider value={contextValue}>
      <div ref={containerRef} className={clsx("tw:relative", className)} style={style}>
        {children}
      </div>
    </CanvasContext.Provider>
  );
};
