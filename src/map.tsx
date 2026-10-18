"use client";
// Static route map: the booking plan as a line, dots only where a tracking event confirmed the shipment.
import { Map as MapLibre } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { coords, lanes } from "./data";
import type { ShipmentView } from "./domain";

export default function RouteMap({ v }: { v: ShipmentView }) {
  const el = useRef<HTMLDivElement>(null);

  // Mounted once per set of confirmed events: the parent remounts it through `key`.
  useEffect(() => {
    const plan = v.shipment.legs.map((l) => [coords[l.from], ...(lanes[`${l.from}>${l.to}`] ?? []), coords[l.to]]);
    const stops = [...new Set(v.events.filter((e) => e.kind === "actual").map((e) => e.location))].map((p) => coords[p]);
    const lng = plan.flat().map((c) => c[0]);
    const lat = plan.flat().map((c) => c[1]);
    const css = getComputedStyle(document.documentElement);
    const color = (token: string) => css.getPropertyValue(`--color-${token}`).trim();

    const map = new MapLibre({
      container: el.current!,
      interactive: false,
      attributionControl: false,
      bounds: [Math.min(...lng), Math.min(...lat), Math.max(...lng), Math.max(...lat)],
      fitBoundsOptions: { padding: 24 },
      style: {
        version: 8,
        sources: {
          osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19 },
          plan: { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: plan } } },
          stops: { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "MultiPoint", coordinates: stops } } },
        },
        layers: [
          { id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -1 } },
          { id: "plan", type: "line", source: "plan", paint: { "line-color": color("ink-2"), "line-width": 1.5 } },
          {
            id: "stops",
            type: "circle",
            source: "stops",
            paint: { "circle-color": color("ink"), "circle-radius": 4, "circle-stroke-color": "#fff", "circle-stroke-width": 2 },
          },
        ],
      },
    });
    return () => map.remove();
  }, []);

  return <div ref={el} className="size-full" />;
}
