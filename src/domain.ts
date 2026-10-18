// Canonical shipment model and pure derivations. No React, no I/O.

export const DEMO_NOW = "2026-11-12T10:00:00Z";

export type Mode = "road" | "sea";

export type Code =
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "ARRIVED_PORT"
  | "VESSEL_DEPARTED"
  | "VESSEL_ARRIVED"
  | "CUSTOMS_HOLD"
  | "CUSTOMS_CLEARED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "DELIVERY_FAILED";

export type Site = { id: string; name: string };
export type Account = { id: string; name: string; country: string };
export type Operator = { id: string; name: string };

export type Leg = {
  mode: Mode;
  operatorId: string;
  from: string;
  to: string;
  plannedDeparture: string;
  plannedArrival: string;
};

export type Shipment = {
  ref: string;
  accountId: string;
  originSiteId: string;
  destination: string;
  customs: boolean;
  promisedDate: string;
  legs: Leg[];
  documents: { name: string; status: "available" | "missing" }[];
};

export type TrackingEvent = {
  shipmentRef: string;
  leg?: number;
  code: Code;
  // "estimate" = operator-declared arrival of `leg`, never shown as fact.
  kind: "actual" | "estimate";
  at: string;
  location: string;
  source: {
    operatorId: string;
    rawId: string;
    rawCode: string;
    receivedAt: string;
    confidence?: number; // set when an AI extraction produced the event
  };
};

export type Prediction = {
  from: string;
  to: string;
  confidence: "low" | "medium" | "high";
  reasons: string[];
};

export type Persona = {
  id: string;
  name: string;
  role: "customer" | "operations";
  accountIds?: string[];
  siteIds?: string[];
};

export type Status = "on_track" | "at_risk" | "delayed" | "on_hold" | "stale" | "delivered";
export type Phase = "preparing" | "in_transit" | "at_customs" | "out_for_delivery" | "delivered";
export type Action = "notify_customer" | "contact_operator" | "upload_document";
export type ShipmentException = {
  type: "customs_hold" | "delivery_failed" | "stale" | "delay" | "at_risk" | "missing_document";
  action: Action;
  severity: 1 | 2 | 3;
};

export type ShipmentView = {
  shipment: Shipment;
  events: TrackingEvent[];
  last?: TrackingEvent;
  lastUpdate?: string;
  phase: Phase;
  status: Status;
  eta: { planned: string; carrier?: string; predicted?: Prediction; actual?: string };
  exceptions: ShipmentException[];
};

const t = Date.parse;
const H = 3_600_000;
// Max silence per mode before a shipment counts as stale.
const STALE_AFTER: Record<Mode, number> = { road: 12 * H, sea: 96 * H };

const PHASE: Partial<Record<Code, Phase>> = {
  CUSTOMS_HOLD: "at_customs",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERY_FAILED: "out_for_delivery",
  DELIVERED: "delivered",
};

export const visible = (p: Persona, shipments: Shipment[]) =>
  shipments.filter(
    (s) => (p.accountIds?.includes(s.accountId) ?? true) && (p.siteIds?.includes(s.originSiteId) ?? true),
  );

// Latest operator estimate for a leg's arrival, shifted by the planned duration of the legs after it.
function carrierEta(s: Shipment, events: TrackingEvent[]) {
  const est = events
    .filter((e) => e.kind === "estimate" && e.leg !== undefined)
    .sort((a, b) => t(a.source.receivedAt) - t(b.source.receivedAt))
    .at(-1);
  if (!est) return undefined;
  const rest = s.legs.slice(est.leg! + 1).reduce((sum, l) => sum + t(l.plannedArrival) - t(l.plannedDeparture), 0);
  return new Date(t(est.at) + rest).toISOString();
}

export function view(s: Shipment, allEvents: TrackingEvent[], predicted: Prediction | undefined, now: string): ShipmentView {
  const events = allEvents.filter((e) => e.shipmentRef === s.ref).sort((a, b) => t(a.at) - t(b.at));
  const actuals = events.filter((e) => e.kind === "actual");
  const last = actuals.at(-1);
  const delivered = actuals.find((e) => e.code === "DELIVERED");
  const lastUpdate = events.map((e) => e.source.receivedAt).sort((a, b) => t(a) - t(b)).at(-1);

  const planned = s.legs.at(-1)!.plannedArrival;
  const carrier = carrierEta(s, events);
  const promised = t(s.promisedDate);

  const onHold = last?.code === "CUSTOMS_HOLD";
  const mode = s.legs[last?.leg ?? 0].mode;
  // No update yet → silence counts from planned pickup (missed pickup).
  const stale = !delivered && t(now) - t(lastUpdate ?? s.legs[0].plannedDeparture) > STALE_AFTER[mode];
  const late = !delivered && (t(carrier ?? planned) > promised || t(now) > promised);
  const atRisk = !delivered && !!predicted && t(predicted.to) > promised;
  const missingDoc = s.documents.some((d) => d.status === "missing");

  const exceptions: ShipmentException[] = [];
  if (onHold) exceptions.push({ type: "customs_hold", action: missingDoc ? "upload_document" : "contact_operator", severity: 3 });
  if (last?.code === "DELIVERY_FAILED") exceptions.push({ type: "delivery_failed", action: "contact_operator", severity: 3 });
  if (stale) exceptions.push({ type: "stale", action: "contact_operator", severity: 2 });
  if (late) exceptions.push({ type: "delay", action: "notify_customer", severity: 2 });
  else if (atRisk) exceptions.push({ type: "at_risk", action: "notify_customer", severity: 1 });
  if (!delivered && missingDoc && !onHold) exceptions.push({ type: "missing_document", action: "upload_document", severity: 1 });

  return {
    shipment: s,
    events,
    last,
    lastUpdate,
    phase: last ? (PHASE[last.code] ?? "in_transit") : "preparing",
    status: delivered ? "delivered" : onHold ? "on_hold" : stale ? "stale" : late ? "delayed" : atRisk ? "at_risk" : "on_track",
    eta: { planned, carrier, predicted, actual: delivered?.at },
    exceptions,
  };
}
