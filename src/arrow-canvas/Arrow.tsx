import clsx from "clsx";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useCanvasContext } from "./context";
import {
  clamp01,
  inferConnectingSides,
  pointOnSide,
  pointsToSvgPath,
  toLocalRect,
  type LocalRect,
} from "./geometry";
import { computeRoutePoints } from "./routing";
import type { Anchor, ArrowheadMode, Route, Side } from "./types";

// ─── Anchor + route normalization ──────────────────────────────────────────

type NormalizedAnchor = {
  id: string;
  side: Side | undefined;
  offset: number | undefined;
};

const normalizeAnchor = (anchor: Anchor): NormalizedAnchor =>
  typeof anchor === "string"
    ? { id: anchor, side: undefined, offset: undefined }
    : { id: anchor.id, side: anchor.side, offset: anchor.offset };

// Stable string keys for prop literals so effects don't re-run on every render.
const anchorKey = (anchor: Anchor): string =>
  typeof anchor === "string" ? anchor : JSON.stringify(anchor);

const routeKey = (route: Route): string =>
  typeof route === "string" ? route : JSON.stringify(route);

// ─── Path computation ──────────────────────────────────────────────────────

/** Measures anchored nodes and computes the SVG `d` attribute for the arrow. */
const useArrowPath = (from: Anchor, to: Anchor, route: Route): string => {
  const { getNodeRect, containerRef, revision } = useCanvasContext();
  const [pathD, setPathD] = useState("");

  const fromK = anchorKey(from);
  const toK = anchorKey(to);
  const routeK = routeKey(route);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const nFrom = normalizeAnchor(from);
    const nTo = normalizeAnchor(to);

    const fromDomRect = getNodeRect(nFrom.id);
    const toDomRect = getNodeRect(nTo.id);
    if (!fromDomRect || !toDomRect) return;

    const fromRect = toLocalRect(fromDomRect, containerRect);
    const toRect = toLocalRect(toDomRect, containerRect);

    const [inferredFromSide, inferredToSide] = inferConnectingSides(fromRect, toRect);
    const fromSide = nFrom.side ?? inferredFromSide;
    const toSide = nTo.side ?? inferredToSide;

    const startPoint = pointOnSide(fromRect, fromSide, nFrom.offset ?? 0);
    const endPoint = pointOnSide(toRect, toSide, nTo.offset ?? 0);

    const resolveNodeLocal = (id: string): LocalRect | null => {
      const rect = getNodeRect(id);
      return rect ? toLocalRect(rect, containerRect) : null;
    };

    const points = computeRoutePoints(
      route,
      startPoint,
      fromSide,
      endPoint,
      toSide,
      resolveNodeLocal,
    );

    setPathD(pointsToSvgPath(points));
    // from / to / route are captured through their stable string keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, getNodeRect, containerRef, fromK, toK, routeK]);

  return pathD;
};

// ─── Icon placement ────────────────────────────────────────────────────────

type IconPlacement = {
  x: number;
  y: number;
  /** Dash pattern that carves a gap in the stroke around the icon. */
  strokeDashArray: string;
};

/**
 * Measures the rendered path and returns where to place the icon plus the
 * stroke-dasharray that carves a gap around it. Runs after `useArrowPath`
 * has applied `pathD` to the DOM.
 */
const useIconPlacement = (
  pathRef: RefObject<SVGPathElement | null>,
  pathD: string,
  iconAt: number,
  iconGap: number,
  enabled: boolean,
): IconPlacement | null => {
  const [measured, setMeasured] = useState<IconPlacement | null>(null);

  useLayoutEffect(() => {
    if (!enabled || !pathD) return;
    const path = pathRef.current;
    if (!path) return;

    const totalLength = path.getTotalLength();
    if (totalLength === 0) return;

    const iconDistance = clamp01(iconAt) * totalLength;
    const iconPoint = path.getPointAtLength(iconDistance);

    const halfGap = iconGap / 2;
    const strokeBeforeIcon = Math.max(0, iconDistance - halfGap);
    const strokeAfterIcon = Math.max(0, totalLength - iconDistance - halfGap);

    // dash-gap-dash-gap; trailing huge gap so the pattern never repeats.
    const strokeDashArray = `${strokeBeforeIcon} ${iconGap} ${strokeAfterIcon} 99999`;

    setMeasured({ x: iconPoint.x, y: iconPoint.y, strokeDashArray });
  }, [pathRef, pathD, iconAt, iconGap, enabled]);

  return enabled ? measured : null;
};

// ─── Arrowhead marker ──────────────────────────────────────────────────────

type ArrowheadMarkerProps = {
  id: string;
  size: number;
  color: string;
};

const ArrowheadMarker = ({ id, size, color }: ArrowheadMarkerProps) => (
  <marker
    id={id}
    viewBox="0 0 10 10"
    refX="8"
    refY="5"
    markerWidth={size}
    markerHeight={size}
    markerUnits="userSpaceOnUse"
    orient="auto-start-reverse"
  >
    <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
  </marker>
);

// ─── Arrow ─────────────────────────────────────────────────────────────────

export type ArrowProps = {
  from: Anchor;
  to: Anchor;
  route?: Route;
  icon?: ReactNode;
  /** Position of the icon along the path, 0 (start) to 1 (end). Default 0.5. */
  iconAt?: number;
  /** Gap (px) carved out of the stroke around the icon. Default 28. */
  iconGap?: number;
  /** Any CSS color. Defaults to `currentColor` so it inherits from the parent. */
  stroke?: string;
  strokeWidth?: number;
  /** Which ends carry an arrowhead. Default `"end"`. */
  arrowhead?: ArrowheadMode;
  /** Arrowhead size in pixels. Default 12. */
  arrowheadSize?: number;
  className?: string;
};

export const Arrow = ({
  from,
  to,
  route = "straight",
  icon,
  iconAt = 0.5,
  iconGap = 28,
  stroke = "currentColor",
  strokeWidth = 2,
  arrowhead = "end",
  arrowheadSize = 12,
  className,
}: ArrowProps) => {
  const pathRef = useRef<SVGPathElement | null>(null);

  const pathD = useArrowPath(from, to, route);
  const iconPlacement = useIconPlacement(pathRef, pathD, iconAt, iconGap, Boolean(icon));

  // React 19's useId produces e.g. ":r0:", which isn't a valid SVG fragment id.
  const markerId = `arrowhead-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const showStart = arrowhead === "start" || arrowhead === "both";
  const showEnd = arrowhead === "end" || arrowhead === "both";
  const needsMarker = showStart || showEnd;

  return (
    <>
      <svg
        className={clsx(
          "tw:absolute tw:inset-0 tw:w-full tw:h-full tw:pointer-events-none tw:overflow-visible",
          className,
        )}
      >
        {needsMarker && (
          <defs>
            <ArrowheadMarker id={markerId} size={arrowheadSize} color={stroke} />
          </defs>
        )}
        <path
          ref={pathRef}
          d={pathD}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={iconPlacement?.strokeDashArray}
          markerStart={showStart ? `url(#${markerId})` : undefined}
          markerEnd={showEnd ? `url(#${markerId})` : undefined}
        />
      </svg>

      {icon && iconPlacement && (
        <div
          className="tw:absolute tw:-translate-x-1/2 tw:-translate-y-1/2 tw:pointer-events-none"
          style={{ left: iconPlacement.x, top: iconPlacement.y }}
        >
          {icon}
        </div>
      )}
    </>
  );
};
