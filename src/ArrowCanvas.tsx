import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

// ═══════════════════════════════════════════════════════════════════════════
// Public types
// ═══════════════════════════════════════════════════════════════════════════

export type Side = "top" | "right" | "bottom" | "left";
export type Axis = "x" | "y";

/**
 * An endpoint of an arrow. Either the id of a registered node (for default
 * auto-routing), or an object pinning the arrow to a specific edge of the
 * node with an optional offset along that edge.
 */
export type Anchor =
  | string
  | {
      id: string;
      side?: Side;
      offset?: number;
    };

/** A reference to a specific edge of a registered node. */
export type EdgeReference = {
  id: string;
  side: Side;
  offset?: number;
};

/**
 * One segment of a manually routed path. The path moves along `axis` until
 * it reaches `at` — either an absolute coordinate, or a coordinate derived
 * from another node's edge (so the arrow re-routes when that node moves).
 */
export type Waypoint = {
  axis: Axis;
  at: number | EdgeReference;
};

export type Route =
  | "straight"
  | "orthogonal"
  | { waypoints: Waypoint[] };

// ═══════════════════════════════════════════════════════════════════════════
// Internal types
// ═══════════════════════════════════════════════════════════════════════════

type Point = { x: number; y: number };

/** A DOMRect-like shape in coordinates local to the ArrowCanvas. */
type LocalRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
};

// ═══════════════════════════════════════════════════════════════════════════
// Small helpers
// ═══════════════════════════════════════════════════════════════════════════

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const isHorizontalSide = (side: Side) => side === "left" || side === "right";

// ═══════════════════════════════════════════════════════════════════════════
// Geometry
// ═══════════════════════════════════════════════════════════════════════════

const toLocalRect = (rect: DOMRect, container: DOMRect): LocalRect => {
  const left = rect.left - container.left;
  const top = rect.top - container.top;
  return {
    left,
    top,
    right: rect.right - container.left,
    bottom: rect.bottom - container.top,
    width: rect.width,
    height: rect.height,
    cx: left + rect.width / 2,
    cy: top + rect.height / 2,
  };
};

const pointOnSide = (rect: LocalRect, side: Side, offset = 0): Point => {
  switch (side) {
    case "top":    return { x: rect.cx + offset, y: rect.top };
    case "bottom": return { x: rect.cx + offset, y: rect.bottom };
    case "left":   return { x: rect.left,        y: rect.cy + offset };
    case "right":  return { x: rect.right,       y: rect.cy + offset };
  }
};

/** Pick the most natural entry/exit edges based on relative node positions. */
const inferConnectingSides = (from: LocalRect, to: LocalRect): [Side, Side] => {
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ["right", "left"] : ["left", "right"];
  }
  return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
};

const pointsToSvgPath = (points: Point[]): string =>
  points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

// ═══════════════════════════════════════════════════════════════════════════
// Route builders
// ═══════════════════════════════════════════════════════════════════════════

const routeStraight = (start: Point, end: Point): Point[] => [start, end];

const routeOrthogonal = (
  start: Point,
  startSide: Side,
  end: Point,
  endSide: Side,
): Point[] => {
  const startHorizontal = isHorizontalSide(startSide);
  const endHorizontal = isHorizontalSide(endSide);

  // Both sides horizontal → Z-shape around a midpoint X
  if (startHorizontal && endHorizontal) {
    const midX = (start.x + end.x) / 2;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }

  // Both sides vertical → Z-shape around a midpoint Y
  if (!startHorizontal && !endHorizontal) {
    const midY = (start.y + end.y) / 2;
    return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
  }

  // Mixed → single L-bend
  if (startHorizontal) {
    return [start, { x: end.x, y: start.y }, end];
  }
  return [start, { x: start.x, y: end.y }, end];
};

const resolveWaypointCoordinate = (
  waypoint: Waypoint,
  resolveNodeRect: (id: string) => LocalRect | null,
): number | null => {
  if (typeof waypoint.at === "number") return waypoint.at;

  const rect = resolveNodeRect(waypoint.at.id);
  if (!rect) return null;

  const edgePoint = pointOnSide(rect, waypoint.at.side, waypoint.at.offset ?? 0);
  return waypoint.axis === "x" ? edgePoint.x : edgePoint.y;
};

const routeThroughWaypoints = (
  start: Point,
  waypoints: Waypoint[],
  end: Point,
  resolveNodeRect: (id: string) => LocalRect | null,
): Point[] => {
  const points: Point[] = [start];
  let cursor = start;

  for (const waypoint of waypoints) {
    const coordinate = resolveWaypointCoordinate(waypoint, resolveNodeRect);
    if (coordinate === null) continue;
    cursor =
      waypoint.axis === "x"
        ? { x: coordinate, y: cursor.y }
        : { x: cursor.x, y: coordinate };
    points.push(cursor);
  }

  points.push(end);
  return points;
};

// ═══════════════════════════════════════════════════════════════════════════
// Canvas context
// ═══════════════════════════════════════════════════════════════════════════

type CanvasContextValue = {
  registerNode: (id: string, element: HTMLElement | null) => void;
  getNodeRect: (id: string) => DOMRect | null;
  containerRef: RefObject<HTMLDivElement | null>;
  /** Increments on any observed resize, forcing arrows to re-measure. */
  revision: number;
};

const CanvasContext = createContext<CanvasContextValue | null>(null);

const useCanvasContext = (): CanvasContextValue => {
  const context = useContext(CanvasContext);
  if (!context) {
    throw new Error("Arrow components must be used inside <ArrowCanvas>");
  }
  return context;
};

// ═══════════════════════════════════════════════════════════════════════════
// Node registry (used internally by ArrowCanvas)
// ═══════════════════════════════════════════════════════════════════════════

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

      // Tear down any previous observer for this id
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

// ═══════════════════════════════════════════════════════════════════════════
// ArrowCanvas
// ═══════════════════════════════════════════════════════════════════════════

export type ArrowCanvasProps = {
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
};

export const ArrowCanvas = ({ children, style, className }: ArrowCanvasProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { registerNode, getNodeRect, revision, invalidate } = useNodeRegistry();

  // Re-measure whenever the canvas itself changes size. This also covers
  // viewport-level changes (zoom, scrollbar appearance) since they propagate
  // down to the container's rendered size.
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
      <div ref={containerRef} className={cx("tw:relative", className)} style={style}>
        {children}
      </div>
    </CanvasContext.Provider>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// useArrowAnchor
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// Anchor / route normalization
// ═══════════════════════════════════════════════════════════════════════════

type NormalizedAnchor = {
  id: string;
  side: Side | undefined;
  offset: number | undefined;
};

const normalizeAnchor = (anchor: Anchor): NormalizedAnchor =>
  typeof anchor === "string"
    ? { id: anchor, side: undefined, offset: undefined }
    : { id: anchor.id, side: anchor.side, offset: anchor.offset };

const anchorKey = (anchor: Anchor): string =>
  typeof anchor === "string" ? anchor : JSON.stringify(anchor);

const routeKey = (route: Route): string =>
  typeof route === "string" ? route : JSON.stringify(route);

// ═══════════════════════════════════════════════════════════════════════════
// Arrow: path computation
// ═══════════════════════════════════════════════════════════════════════════

/** Computes the SVG `d` attribute for an arrow, keyed off measured geometry. */
const useArrowPath = (from: Anchor, to: Anchor, route: Route): string => {
  const { getNodeRect, containerRef, revision } = useCanvasContext();
  const [pathD, setPathD] = useState("");

  // Stable keys so inline prop literals don't re-run the effect unnecessarily
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

    const points: Point[] =
      route === "straight"
        ? routeStraight(startPoint, endPoint)
        : route === "orthogonal"
          ? routeOrthogonal(startPoint, fromSide, endPoint, toSide)
          : routeThroughWaypoints(startPoint, route.waypoints, endPoint, resolveNodeLocal);

    setPathD(pointsToSvgPath(points));
    // from / to / route are captured through their stable string keys
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, getNodeRect, containerRef, fromK, toK, routeK]);

  return pathD;
};

// ═══════════════════════════════════════════════════════════════════════════
// Arrow: icon placement
// ═══════════════════════════════════════════════════════════════════════════

type IconPlacement = {
  x: number;
  y: number;
  /** Dash pattern that carves a gap in the stroke around the icon. */
  strokeDashArray: string;
};

/**
 * Measures the rendered path and returns where to put the icon and the
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
  const [placement, setPlacement] = useState<IconPlacement | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      setPlacement(null);
      return;
    }
    const path = pathRef.current;
    if (!path || !pathD) return;

    const totalLength = path.getTotalLength();
    if (totalLength === 0) return;

    const iconDistance = clamp01(iconAt) * totalLength;
    const iconPoint = path.getPointAtLength(iconDistance);

    const halfGap = iconGap / 2;
    const strokeBeforeIcon = Math.max(0, iconDistance - halfGap);
    const strokeAfterIcon = Math.max(0, totalLength - iconDistance - halfGap);

    // dash-gap-dash-gap; trailing huge gap so the pattern never repeats
    const strokeDashArray = `${strokeBeforeIcon} ${iconGap} ${strokeAfterIcon} 99999`;

    setPlacement({ x: iconPoint.x, y: iconPoint.y, strokeDashArray });
  }, [pathRef, pathD, iconAt, iconGap, enabled]);

  return placement;
};

// ═══════════════════════════════════════════════════════════════════════════
// Arrow
// ═══════════════════════════════════════════════════════════════════════════

export type ArrowProps = {
  from: Anchor;
  to: Anchor;
  route?: Route;
  icon?: ReactNode;
  /** Position of the icon along the path, 0 (start) to 1 (end). Default 0.5. */
  iconAt?: number;
  /** Gap (px) carved out of the stroke around the icon. Default 28. */
  iconGap?: number;
  stroke?: string;
  strokeWidth?: number;
  arrowhead?: boolean;
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
  arrowhead = true,
  className,
}: ArrowProps) => {
  const pathRef = useRef<SVGPathElement | null>(null);

  const pathD = useArrowPath(from, to, route);
  const iconPlacement = useIconPlacement(pathRef, pathD, iconAt, iconGap, Boolean(icon));

  const markerId = `arrow-head-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <>
      <svg
        className={cx(
          "tw:absolute tw:inset-0 tw:w-full tw:h-full tw:pointer-events-none tw:overflow-visible",
          className,
        )}
      >
        {arrowhead && (
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
            </marker>
          </defs>
        )}
        <path
          ref={pathRef}
          d={pathD}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={iconPlacement?.strokeDashArray}
          markerEnd={arrowhead ? `url(#${markerId})` : undefined}
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

// ═══════════════════════════════════════════════════════════════════════════
// Demo
// ═══════════════════════════════════════════════════════════════════════════

type CardProps = {
  id: string;
  children: ReactNode;
  style?: CSSProperties;
};

const Card = ({ id, children, style }: CardProps) => {
  const ref = useArrowAnchor<HTMLDivElement>(id);
  return (
    <div
      ref={ref}
      className="tw:absolute tw:px-5 tw:py-3.5 tw:bg-white tw:border tw:border-slate-300 tw:rounded-[10px] tw:shadow-sm tw:font-sans tw:text-sm tw:font-medium tw:text-slate-900 tw:whitespace-nowrap"
      style={style}
    >
      {children}
    </div>
  );
};

type BadgeProps = {
  children: ReactNode;
  color?: string;
};

const Badge = ({ children, color = "#0ea5e9" }: BadgeProps) => (
  <div
    className="tw:w-7 tw:h-7 tw:rounded-full tw:flex tw:items-center tw:justify-center tw:text-[13px] tw:font-bold tw:text-white tw:font-sans tw:ring-4 tw:ring-slate-100 tw:shadow-md"
    style={{ backgroundColor: color }}
  >
    {children}
  </div>
);

const Demo = () => (
  <div className="tw:p-8 tw:bg-slate-100 tw:min-h-screen tw:font-sans">
    <h2 className="tw:m-0 tw:mb-1.5 tw:text-slate-900 tw:font-semibold">
      Arrow Canvas
    </h2>
    <p className="tw:mt-0 tw:mb-7 tw:text-slate-500 tw:text-sm">
      Three orthogonal arrows with centered icons, plus one waypoint-routed
      arrow going around the cache.
    </p>

    <ArrowCanvas className="tw:text-slate-500" style={{ height: 540 }}>
      <Card id="src"   style={{ left: 40,  top: 250 }}>Source</Card>

      <Card id="auth"  style={{ left: 320, top: 60  }}>Auth Service</Card>
      <Card id="db"    style={{ left: 320, top: 250 }}>Database</Card>
      <Card id="cache" style={{ left: 320, top: 440 }}>Cache</Card>

      <Card id="sink"  style={{ left: 680, top: 60  }}>Destination</Card>

      <Arrow from="src" to="auth"  route="orthogonal" icon={<Badge>1</Badge>} />
      <Arrow from="src" to="db"    route="orthogonal" icon={<Badge>2</Badge>} />
      <Arrow from="src" to="cache" route="orthogonal" icon={<Badge>3</Badge>} />

      <Arrow
        from={{ id: "src",  side: "bottom" }}
        to={{   id: "sink", side: "left"   }}
        route={{
          waypoints: [
            { axis: "y", at: { id: "cache", side: "bottom", offset: 40 } },
            { axis: "x", at: { id: "sink",  side: "left",   offset: -60 } },
            { axis: "y", at: { id: "sink",  side: "left"                 } },
          ],
        }}
        icon={<Badge color="#f59e0b">★</Badge>}
        iconAt={0.78}
        stroke="#f59e0b"
      />
    </ArrowCanvas>
  </div>
);

export default Demo;
