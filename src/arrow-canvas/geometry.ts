import type { Side } from "./types";

export type Point = { x: number; y: number };

/** A DOMRect-like shape in coordinates local to the ArrowCanvas. */
export type LocalRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const isHorizontalSide = (side: Side) =>
  side === "left" || side === "right";

export const toLocalRect = (rect: DOMRect, container: DOMRect): LocalRect => {
  const left = rect.left - container.left;
  const top = rect.top - container.top;
  return {
    left,
    top,
    right: rect.right - container.left,
    bottom: rect.bottom - container.top,
    width: rect.width,
    height: rect.height,
    centerX: left + rect.width / 2,
    centerY: top + rect.height / 2,
  };
};

export const pointOnSide = (rect: LocalRect, side: Side, offset = 0): Point => {
  switch (side) {
    case "top":
      return { x: rect.centerX, y: rect.top + offset };
    case "bottom":
      return { x: rect.centerX, y: rect.bottom + offset };
    case "left":
      return { x: rect.left + offset, y: rect.centerY };
    case "right":
      return { x: rect.right + offset, y: rect.centerY };
  }
};

/** Pick the most natural entry/exit edges based on relative node positions. */
export const inferConnectingSides = (
  from: LocalRect,
  to: LocalRect,
): [Side, Side] => {
  const dx = to.centerX - from.centerX;
  const dy = to.centerY - from.centerY;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ["right", "left"] : ["left", "right"];
  }
  return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
};

export const pointsToSvgPath = (points: Point[]): string =>
  points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
