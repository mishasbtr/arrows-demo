import { Arrow, ArrowCanvas } from "../arrow-canvas";
import { Badge } from "./Badge";
import { Card } from "./Card";

export const Demo = () => (
  <div className="tw:p-8 tw:bg-slate-100 tw:min-h-screen tw:font-sans">
    <h2 className="tw:m-0 tw:mb-1.5 tw:text-slate-900 tw:font-semibold">
      Arrow Canvas
    </h2>
    <p className="tw:mt-0 tw:mb-7 tw:text-slate-500 tw:text-sm">
      Three orthogonal arrows with centered icons, one waypoint-routed arrow
      going around the cache, and one bidirectional arrow between DB and cache.
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
        from="db"
        to="cache"
        arrowhead="both"
        arrowheadSize={16}
        stroke="#10b981"
        strokeWidth={2.5}
      />

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
