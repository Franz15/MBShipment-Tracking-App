"use client";
// Static route map: solid where tracking events confirmed the shipment, dotted for the rest of the booking plan.
import { Map as MapLibre, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { coords, lanes } from "./data";
import type { ShipmentView } from "./domain";

type Pt = [number, number];
const same = (a: Pt) => (b: Pt) => a[0] === b[0] && a[1] === b[1];

// Split the plan at the last confirmed location. Nothing past it is drawn as travelled.
function split(v: ShipmentView) {
  const plan = v.shipment.legs.map((l) => [coords[l.from], ...(lanes[`${l.from}>${l.to}`] ?? []), coords[l.to]]);
  if (v.eta.actual) return { done: plan, todo: [] };
  const last = v.events.findLast((e) => e.kind === "actual" && e.leg !== undefined);
  if (!last) return { done: [], todo: plan };
  const leg = plan[last.leg!];
  const i = Math.max(0, leg.findIndex(same(coords[last.location])));
  return {
    done: [...plan.slice(0, last.leg), leg.slice(0, i + 1)],
    todo: [leg.slice(i), ...plan.slice(last.leg! + 1)],
  };
}

const lines = (coordinates: Pt[][]) => ({
  type: "Feature" as const,
  properties: {},
  geometry: { type: "MultiLineString" as const, coordinates: coordinates.filter((l) => l.length > 1) },
});
const points = (coordinates: Pt[]) => ({ type: "Feature" as const, properties: {}, geometry: { type: "MultiPoint" as const, coordinates } });

export default function RouteMap({ v }: { v: ShipmentView }) {
  const el = useRef<HTMLDivElement>(null);

  // Mounted once per set of confirmed events: the parent remounts it through `key`.
  useEffect(() => {
    const { done, todo } = split(v);
    const all = [...done, ...todo].flat();
    const stops = [...new Set(v.events.filter((e) => e.kind === "actual").map((e) => e.location))].map((p) => coords[p]);
    const here = v.last ? [coords[v.last.location]] : [];
    const end = v.eta.actual ? [] : [coords[v.shipment.legs.at(-1)!.to]];
    const css = getComputedStyle(document.documentElement);
    const color = (token: string) => css.getPropertyValue(`--color-${token}`).trim();
    const dark = document.documentElement.dataset.theme === "dark";
    const dot = (radius: number, fill: string, stroke = color("surface")) => ({
      "circle-radius": radius, "circle-color": fill, "circle-stroke-color": stroke, "circle-stroke-width": 2,
    });

    let map: MapLibre | undefined;
    let gone = false;
    // OpenFreeMap base: OSM data, no key, a light and a dark style that match the theme.
    fetch(`https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`)
      .then((r) => r.json() as Promise<StyleSpecification>)
      .then((base) => {
        if (gone) return;
        map = new MapLibre({
          container: el.current!,
          interactive: false,
          attributionControl: false,
          bounds: [Math.min(...all.map((c) => c[0])), Math.min(...all.map((c) => c[1])), Math.max(...all.map((c) => c[0])), Math.max(...all.map((c) => c[1]))],
          fitBoundsOptions: { padding: 24 },
          style: {
            ...base,
            sources: {
              ...base.sources,
              done: { type: "geojson", data: lines(done) },
              todo: { type: "geojson", data: lines(todo) },
              stops: { type: "geojson", data: points(stops) },
              here: { type: "geojson", data: points(here) },
              end: { type: "geojson", data: points(end) },
            },
            layers: [
              ...base.layers,
              {
                id: "todo",
                type: "line",
                source: "todo",
                layout: { "line-cap": "round" },
                paint: { "line-color": color("ink-2"), "line-width": 2, "line-opacity": 0.7, "line-dasharray": [0, 2] },
              },
              { id: "done", type: "line", source: "done", paint: { "line-color": color("ink"), "line-width": 3 } },
              { id: "end", type: "circle", source: "end", paint: dot(5, color("surface"), color("ink-2")) },
              { id: "stops", type: "circle", source: "stops", paint: dot(4, color("ink")) },
              { id: "here", type: "circle", source: "here", paint: dot(7, color("ink")) },
            ],
          },
        });
      });
    return () => {
      gone = true;
      map?.remove();
    };
  }, []);

  return <div ref={el} className="size-full" />;
}
