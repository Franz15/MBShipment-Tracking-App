import { describe, expect, it } from "vitest";
import { normalize, toEvents, type RawEvent } from "./adapters";
import { coords, extractions, personas, rawEvents, script, shipments } from "./data";
import { DEMO_NOW, visible } from "./domain";
import { INITIAL, shipmentViews } from "./ui";

const views = (step = 0, approved: string[] = []) => {
  const reviews = Object.fromEntries(approved.map((id) => [id, "approved" as const]));
  return Object.fromEntries(shipmentViews(shipments, { ...INITIAL, step, reviews }).map((v) => [v.shipment.ref, v]));
};

describe("adapters", () => {
  const env = { id: "x", operatorId: "o", shipmentRef: "S", leg: 0, receivedAt: DEMO_NOW };

  it("maps DCSA actuals and estimates", () => {
    const dep = normalize({ ...env, format: "dcsa", payload: { eventClassifierCode: "ACT", transportEventTypeCode: "DEPA", eventDateTime: DEMO_NOW, UNLocationCode: "ESBIO" } });
    const est = normalize({ ...env, format: "dcsa", payload: { eventClassifierCode: "EST", transportEventTypeCode: "ARRI", eventDateTime: DEMO_NOW, UNLocationCode: "XXXXX" } });
    expect(dep).toMatchObject({ code: "VESSEL_DEPARTED", kind: "actual", location: "Bilbao port, ES" });
    expect(est).toMatchObject({ code: "VESSEL_ARRIVED", kind: "estimate", location: "XXXXX" });
  });

  it("maps Spanish free text regardless of accents and case, parses dd/mm/yyyy", () => {
    const es = (estado: string): RawEvent => ({ ...env, format: "text-es", payload: { estado, fecha: "12/11/2026 07:30", ubicacion: "Madrid" } });
    expect(normalize(es("En tránsito"))).toMatchObject({ code: "IN_TRANSIT", at: "2026-11-12T07:30:00.000Z" });
    expect(normalize(es("EN TRANSITO"))?.code).toBe("IN_TRANSIT");
    expect(normalize(es("INCIDENCIA: AUSENTE"))?.code).toBe("DELIVERY_FAILED");
    expect(normalize(es("PENDIENTE DE CITA"))).toBeNull(); // unknown → never guessed
  });

  it("keeps low-confidence AI extractions out until approved", () => {
    const has = (id: string, approved?: string[]) => toEvents(rawEvents, extractions, approved).some((e) => e.source.rawId === id);
    expect(has("r5002-1")).toBe(false);
    expect(has("r5002-1", ["r5002-1"])).toBe(true);
    expect(has("r2001-5")).toBe(true); // 0.94 auto-applies
  });
});

describe("shipment view", () => {
  it("derives the intended scenario for every shipment", () => {
    const status = Object.fromEntries(Object.entries(views()).map(([ref, v]) => [ref, v.status]));
    expect(status).toEqual({
      "SHP-1041": "on_track",
      "SHP-1042": "delivered",
      "SHP-1043": "stale",
      "SHP-2001": "on_hold",
      "SHP-2002": "on_track",
      "SHP-2003": "at_risk",
      "SHP-3001": "delayed",
      "SHP-3002": "on_track",
      "SHP-4001": "on_track",
      "SHP-4002": "stale",
      "SHP-5001": "on_track",
      "SHP-5002": "stale",
    });
  });

  it("next actions", () => {
    const v = views();
    expect(v["SHP-2001"].exceptions[0]).toMatchObject({ type: "customs_hold", action: "upload_document" });
    expect(v["SHP-4002"].exceptions.map((e) => e.type)).toEqual(["delivery_failed", "stale", "delay"]);
  });

  it("shifts a vessel ETA by the remaining planned legs", () => {
    expect(views()["SHP-3001"].eta.carrier).toBe("2026-11-29T06:00:00.000Z"); // Veracruz 27th + 2-day inland leg
  });

  it("never shows a booking plan that no longer holds as the expected date", () => {
    const basis = (v: ReturnType<typeof views>[string]) => v.eta.basis;
    expect(basis(views()["SHP-2001"])).toBe("calculated"); // held at customs
    expect(basis(views()["SHP-1043"])).toBe("calculated"); // no signal
    expect(views()["SHP-5002"].eta.expected).toBeUndefined(); // missed pickup, no range
    expect(basis(views()["SHP-2003"])).toBe("calculated"); // carrier only covers Portsmouth: a floor, not the date
    expect(views()["SHP-2003"].eta.carrier).toBe("2026-11-13T06:00:00.000Z");
    expect(basis(views(2, ["r2003-5"])["SHP-2003"])).toBe("carrier"); // last-leg estimate is the date
    expect(basis(views(4)["SHP-2003"])).toBe("calculated"); // Atlas estimate passed with no arrival
  });

  it("approving the operator email turns a missed pickup into a confirmed delay", () => {
    expect(views(0, ["r5002-1"])["SHP-5002"].status).toBe("delayed");
  });
});

describe("demo script", () => {
  it("each step changes only what it says", () => {
    expect(views(1)["SHP-2002"].status).toBe("delayed");
    expect(views(2)["SHP-2003"].status).toBe("at_risk"); // email below AUTO_APPLY waits for review
    expect(views(2, ["r2003-5"])["SHP-2003"].status).toBe("delayed");
    expect(views(3)["SHP-1041"].status).toBe("stale");
    expect(views(4)["SHP-1041"].status).toBe("delivered");
  });
});

describe("perimeter", () => {
  const refs = (id: string) => visible(personas.find((p) => p.id === id)!, shipments).map((s) => s.ref);

  it("customer maps place every leg end and every confirmed event", () => {
    const own = personas.filter((p) => p.role === "customer").flatMap((p) => visible(p, shipments));
    const raws = [...rawEvents, ...script.flatMap((s) => s.raw ?? [])].filter((r) => own.some((s) => s.ref === r.shipmentRef));
    const places = [
      ...own.flatMap((s) => s.legs.flatMap((l) => [l.from, l.to])),
      ...toEvents(raws, extractions, Object.keys(extractions)).filter((e) => e.kind === "actual").map((e) => e.location),
    ];
    expect(places.filter((p) => !coords[p])).toEqual([]);
  });

  it("customer sees only own account, ops only own site or accounts", () => {
    expect(refs("lyon-subsidiary")).toEqual(["SHP-1041", "SHP-1042", "SHP-1043"]);
    expect(refs("valencia-site")).toEqual(["SHP-1042", "SHP-3001", "SHP-4002", "SHP-5001", "SHP-5002"]);
    expect(refs("key-accounts")).toEqual(["SHP-2001", "SHP-2002", "SHP-2003", "SHP-3001", "SHP-3002"]);
  });
});
