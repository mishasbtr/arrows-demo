export type Side = "top" | "right" | "bottom" | "left";
export type Axis = "x" | "y";

/**
 * An endpoint of an arrow. Either the id of a registered node (the arrow
 * auto-picks an edge based on relative position), or an object pinning it to
 * a specific edge with an optional offset along that edge.
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
 * One segment of a manually routed path. The path moves along `axis` until it
 * reaches `at` — either an absolute coordinate, or a coordinate derived from
 * another node's edge (so the arrow re-routes when that node moves).
 */
export type Waypoint = {
  axis: Axis;
  at: number | EdgeReference;
};

export type Route =
  | "straight"
  | "orthogonal"
  | { waypoints: Waypoint[] };

/** Which ends of the arrow render an arrowhead. */
export type ArrowheadMode = "start" | "end" | "both" | "none";
