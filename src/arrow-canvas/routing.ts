import {
  isHorizontalSide,
  pointOnSide,
  type LocalRect,
  type Point,
} from "./geometry";
import type { Route, Side, Waypoint } from "./types";

const straight = (start: Point, end: Point): Point[] => [start, end];

const orthogonal = (
  start: Point,
  startSide: Side,
  end: Point,
  endSide: Side,
): Point[] => {
  const startHorizontal = isHorizontalSide(startSide);
  const endHorizontal = isHorizontalSide(endSide);

  // Both sides horizontal → Z-shape around a midpoint X.
  if (startHorizontal && endHorizontal) {
    const midX = (start.x + end.x) / 2;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }

  // Both sides vertical → Z-shape around a midpoint Y.
  if (!startHorizontal && !endHorizontal) {
    const midY = (start.y + end.y) / 2;
    return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
  }

  // Mixed → single L-bend.
  if (startHorizontal) {
    return [start, { x: end.x, y: start.y }, end];
  }
  return [start, { x: start.x, y: end.y }, end];
};

type ResolveNodeRect = (id: string) => LocalRect | null;

const resolveWaypointCoordinate = (
  waypoint: Waypoint,
  resolveNodeRect: ResolveNodeRect,
): number | null => {
  if (typeof waypoint.at === "number") return waypoint.at;

  const rect = resolveNodeRect(waypoint.at.id);
  if (!rect) return null;

  const edgePoint = pointOnSide(rect, waypoint.at.side, waypoint.at.offset ?? 0);
  return waypoint.axis === "x" ? edgePoint.x : edgePoint.y;
};

const throughWaypoints = (
  start: Point,
  waypoints: Waypoint[],
  end: Point,
  resolveNodeRect: ResolveNodeRect,
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

export const computeRoutePoints = (
  route: Route,
  start: Point,
  startSide: Side,
  end: Point,
  endSide: Side,
  resolveNodeRect: ResolveNodeRect,
): Point[] => {
  if (route === "straight") return straight(start, end);
  if (route === "orthogonal") return orthogonal(start, startSide, end, endSide);
  return throughWaypoints(start, route.waypoints, end, resolveNodeRect);
};
