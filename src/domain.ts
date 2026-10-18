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

// Sites, accounts and operators.
export type Named = { id: string; name: string };

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
  sample: number; // past shipments on the same lane the range is built from
  updates: string; // the next fact that would move the range
};

export type Persona = {
  id: string;
  name: string;
  role: "customer" | "operations";
  accountIds?: string[];
  siteIds?: string[];
};

export type Status = "on_track" | "at_risk" | "delayed" | "on_hold" | "stale" | "delivered";
export type ShipmentException = {
  type: "customs_hold" | "delivery_failed" | "stale" | "delay" | "at_risk" | "missing_document";
  action: "notify_customer" | "contact_operator" | "upload_document";
  severity: 1 | 2 | 3;
};

export type ShipmentView = {
  shipment: Shipment;
  now: string;
  events: TrackingEvent[];
  last?: TrackingEvent;
  silentSince: string;
  status: Status;
  // expected = best date we can stand behind, `basis` says where it comes from; none = unknown.
  eta: {
    planned: string;
    planHolds: boolean;
    carrier?: string;
    carrierEstimate?: TrackingEvent;
    expected?: string;
    basis?: "carrier" | "planned" | "calculated";
    predicted?: Prediction;
    actual?: string;
  };
  exceptions: ShipmentException[];
};

const t = Date.parse;
const H = 3_600_000;
// Max silence per mode before a shipment counts as stale.
const STALE_AFTER: Record<Mode, number> = { road: 12 * H, sea: 96 * H };

export const visible = (p: Persona, shipments: Shipment[]) =>
  shipments.filter(
    (s) => (p.accountIds?.includes(s.accountId) ?? true) && (p.siteIds?.includes(s.originSiteId) ?? true),
  );

// Latest operator estimate, plus the planned length of the legs after it. Expired once its date passes.
function carrierEta(s: Shipment, events: TrackingEvent[], now: string) {
  const est = events
    .filter((e) => e.kind === "estimate" && e.leg !== undefined)
    .sort((a, b) => t(a.source.receivedAt) - t(b.source.receivedAt))
    .at(-1);
  if (!est || t(est.at) <= t(now)) return undefined;
  const rest = s.legs.slice(est.leg! + 1).reduce((sum, l) => sum + t(l.plannedArrival) - t(l.plannedDeparture), 0);
  return { at: new Date(t(est.at) + rest).toISOString(), event: est };
}

export function view(s: Shipment, allEvents: TrackingEvent[], predicted: Prediction | undefined, now: string): ShipmentView {
  const events = allEvents.filter((e) => e.shipmentRef === s.ref).sort((a, b) => t(a.at) - t(b.at));
  const actuals = events.filter((e) => e.kind === "actual");
  const last = actuals.at(-1);
  const delivered = actuals.find((e) => e.code === "DELIVERED");
  // No update yet → silence counts from planned pickup (missed pickup).
  const silentSince = events.map((e) => e.source.receivedAt).sort((a, b) => t(a) - t(b)).at(-1) ?? s.legs[0].plannedDeparture;

  const planned = s.legs.at(-1)!.plannedArrival;
  const est = carrierEta(s, events, now);
  const carrier = est?.at;
  const promised = t(s.promisedDate);

  const onHold = last?.code === "CUSTOMS_HOLD";
  const mode = s.legs[last?.leg ?? 0].mode;
  const stale = !delivered && t(now) - t(silentSince) > STALE_AFTER[mode];

  // The booking plan only holds while nothing has gone wrong and the current leg is not behind it.
  const leg = last?.leg ?? 0;
  const due = !last ? s.legs[0].plannedDeparture : last.code === "VESSEL_ARRIVED" ? s.legs[leg + 1]?.plannedDeparture : s.legs[leg].plannedArrival;
  const planHolds = !onHold && !stale && last?.code !== "DELIVERY_FAILED" && !(due && t(due) < t(now));
  // A carrier estimate for an earlier leg, plus plan, is only a floor: a calculated range beats it.
  const floor = !!est && est.event.leg! < s.legs.length - 1;
  const [expected, basis] = carrier && !(floor && predicted)
    ? [carrier, "carrier" as const]
    : planHolds && !carrier
      ? [planned, "planned" as const]
      : predicted
        ? [predicted.to, "calculated" as const]
        : [undefined, undefined];
  // A calculated range past the promise is a risk, not a confirmed delay; a carrier date past it, even a floor, is.
  const late = !delivered && ((!!carrier && t(carrier) > promised) || (basis === "planned" && t(planned) > promised) || t(now) > promised);
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
    now,
    events,
    last,
    silentSince,
    status: delivered ? "delivered" : onHold ? "on_hold" : stale ? "stale" : late ? "delayed" : atRisk ? "at_risk" : "on_track",
    eta: { planned, planHolds, carrier, carrierEstimate: est?.event, expected, basis, predicted, actual: delivered?.at },
    exceptions,
  };
}
