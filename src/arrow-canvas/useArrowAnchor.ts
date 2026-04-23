import { useLayoutEffect, useRef, type RefObject } from "react";
import { useCanvasContext } from "./context";

/**
 * Registers the returned ref as an arrow endpoint under `id`. Attach it to
 * any element you want an arrow to connect to.
 */
export const useArrowAnchor = <T extends HTMLElement = HTMLDivElement>(
  id: string,
): RefObject<T | null> => {
  const { registerNode } = useCanvasContext();
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    registerNode(id, ref.current);
    return () => registerNode(id, null);
  }, [id, registerNode]);

  return ref;
};
