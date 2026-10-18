import { Ship, Truck } from "lucide-react";
import Link from "next/link";
import { toEvents } from "./adapters";
import { accounts, extractions, operators, personas, predictions, rawEvents, sites } from "./data";
import { DEMO_NOW, view, type Code, type Persona, type Shipment, type ShipmentView, type TrackingEvent } from "./domain";

export const customers = personas.filter((p) => p.role === "customer");
export const customerPersona = (account: string) => customers.find((p) => p.accountIds?.includes(account));

export const shipmentViews = (list: Shipment[]) => {
  const events = toEvents(rawEvents, extractions);
  return list.map((s) => view(s, events, predictions[s.ref], DEMO_NOW));
};

// Formatting. Fixed locale and UTC so server and client render the same text.
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o });
const dayF = fmt({ day: "numeric", month: "short" });
const timeF = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const day = (iso: string) => dayF.format(new Date(iso));
export const dayTime = (iso: string) => `${day(iso)} ${timeF.format(new Date(iso))}`;
const range = (from: string, to: string) => {
  const [a, b] = [day(from), day(to)];
  if (a === b) return a;
  const [da, ma] = a.split(" ");
  return ma === b.split(" ")[1] ? `${da}–${b}` : `${a} – ${b}`;
};
const ago = (iso: string) => {
  const h = Math.floor((Date.parse(DEMO_NOW) - Date.parse(iso)) / 3_600_000);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
};
const daysLate = (iso: string, promised: string) => Math.ceil((Date.parse(iso) - Date.parse(promised)) / 86_400_000);

const nameOf = (list: { id: string; name: string }[]) => (id: string) => list.find((x) => x.id === id)?.name ?? id;
const operatorName = nameOf(operators);
export const siteName = nameOf(sites);

export const perimeter = (p: Persona) =>
  p.siteIds ? `Shipments leaving ${p.siteIds.map(siteName).join(", ")}` : `Shipments for ${p.accountIds!.map(nameOf(accounts)).join(" and ")}`;

const CODE: Record<Code, string> = {
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  ARRIVED_PORT: "Arrived at port",
  VESSEL_DEPARTED: "Vessel departed",
  VESSEL_ARRIVED: "Vessel arrived",
  CUSTOMS_HOLD: "Held at customs",
  CUSTOMS_CLEARED: "Cleared customs",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  DELIVERY_FAILED: "Delivery attempt failed",
};

const STATUS = {
  on_track: ["On track", "text-ok"],
  at_risk: ["At risk", "text-warn"],
  delayed: ["Delayed", "text-bad"],
  on_hold: ["On hold", "text-bad"],
  stale: ["No signal", "text-ink-2"],
  delivered: ["Delivered", "text-ink-2"],
} as const;

const silenceSince = (v: ShipmentView) => v.lastUpdate ?? v.shipment.legs[0].plannedDeparture;

export function StatusBadge({ v }: { v: ShipmentView }) {
  const [text, color] = STATUS[v.status];
  const label = v.status === "stale" ? `${text} ${ago(silenceSince(v))}` : text;
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold whitespace-nowrap ${color}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

// Where the shipment is, from the last confirmed event only.
export function stateSentence(v: ShipmentView) {
  const e = v.last;
  if (!e) return `Booked, pickup planned ${dayTime(v.shipment.legs[0].plannedDeparture)}`;
  return `${CODE[e.code]}, ${e.location} ${e.code === "DELIVERED" ? "on" : "since"} ${dayTime(e.at)}`;
}

// One plain sentence per shipment, from the most severe exception the customer should know about.
export function customerAlert(v: ShipmentView) {
  const missing = v.shipment.documents.filter((d) => d.status === "missing").map((d) => d.name.toLowerCase());
  for (const e of v.exceptions) {
    if (e.type === "customs_hold")
      return missing.length
        ? `Customs needs the ${missing.join(" and ")}. We are filing it with the broker.`
        : "Held at customs. We are in contact with the broker.";
    if (e.type === "delivery_failed") return "Delivery attempt failed. We are rebooking it with the carrier.";
    if (e.type === "stale") return `No update from the carrier for ${ago(silenceSince(v))}. We are checking with them.`;
    if (e.type === "delay") return `Expected after the promised date of ${day(v.shipment.promisedDate)}.`;
    if (e.type === "at_risk" && v.eta.predicted)
      return `May arrive after the promised date. Calculated estimate ${range(v.eta.predicted.from, v.eta.predicted.to)}.`;
  }
}

const Late = ({ iso, promised }: { iso: string; promised: string }) => {
  const d = daysLate(iso, promised);
  return d > 0 ? <span className="font-semibold text-bad">+{d}d</span> : null;
};

// Best-known arrival, with the word that says where it comes from.
export function Expected({ v }: { v: ShipmentView }) {
  if (v.eta.actual) return <>Delivered {day(v.eta.actual)}</>;
  const iso = v.eta.carrier ?? v.eta.planned;
  return (
    <>
      <span className="text-ink-2">{v.eta.carrier ? "Carrier" : "Planned"}</span> {day(iso)}{" "}
      <Late iso={iso} promised={v.shipment.promisedDate} />
    </>
  );
}

const Dot = ({ filled }: { filled: boolean }) => (
  <span className={`size-2 shrink-0 rounded-full ${filled ? "bg-ink" : "border border-line-strong"}`} aria-hidden />
);

const Term = ({ children }: { children: React.ReactNode }) => (
  <dt className="text-xs font-semibold text-ink-2">{children}</dt>
);

// Promised, then carrier, calculated and actual. Each layer looks different and names its source.
export function Eta({ v }: { v: ShipmentView }) {
  const { promisedDate } = v.shipment;
  const src = v.eta.carrierSource;
  const expected = v.eta.carrier ?? v.eta.planned;
  const p = v.eta.predicted;
  return (
    <dl className="space-y-4">
      <div>
        <Term>Promised</Term>
        <dd>{day(promisedDate)}</dd>
      </div>
      {v.eta.actual ? (
        <div>
          <Term>Delivered</Term>
          <dd className="flex items-center gap-2 font-semibold"><Dot filled />{dayTime(v.eta.actual)}</dd>
        </div>
      ) : (
        <>
          <div>
            <Term>{src ? "Carrier estimate" : "Planned"}</Term>
            <dd className="flex items-center gap-2">
              <Dot filled={false} />
              {day(expected)} <Late iso={expected} promised={promisedDate} />
            </dd>
            <dd className="text-xs text-ink-2">
              {src ? `${operatorName(src.operatorId)}, sent ${dayTime(src.receivedAt)}` : "Booking plan, no carrier estimate yet"}
            </dd>
          </div>
          {p && (
            <div>
              <Term>Calculated estimate</Term>
              <dd className="mt-1 border border-dashed border-line-strong px-3 py-2">
                {range(p.from, p.to)} <Late iso={p.to} promised={promisedDate} />
                <details className="mt-1 text-xs text-ink-2">
                  <summary className="cursor-pointer">
                    {p.confidence[0].toUpperCase() + p.confidence.slice(1)} confidence, see why
                  </summary>
                  <ul className="mt-1 list-disc pl-4">{p.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </details>
              </dd>
            </div>
          )}
        </>
      )}
    </dl>
  );
}

const ModeIcon = ({ mode }: { mode: "road" | "sea" }) =>
  mode === "sea" ? <Ship size={14} aria-label="Sea" /> : <Truck size={14} aria-label="Road" />;

const BAD_CODES: Code[] = ["CUSTOMS_HOLD", "DELIVERY_FAILED"];

type Step = { key: string; done: boolean; title: React.ReactNode; meta?: string; events: TrackingEvent[] };

// Legs in order, each with its confirmed events; import customs sits before the last leg.
function steps(v: ShipmentView): Step[] {
  const { legs, customs } = v.shipment;
  const byLeg = legs.map(() => [] as TrackingEvent[]);
  const customsEvents: TrackingEvent[] = [];
  let cur = 0;
  for (const e of v.events) {
    if (e.kind !== "actual") continue;
    if (e.code.startsWith("CUSTOMS")) customsEvents.push(e);
    else byLeg[(cur = e.leg ?? cur)].push(e);
  }
  const out: Step[] = legs.map((l, i) => ({
    key: `leg-${i}`,
    done: byLeg[i].length > 0,
    title: (
      <span className="flex items-center gap-1.5">
        <ModeIcon mode={l.mode} /> {l.from} → {l.to}
      </span>
    ),
    meta: `${operatorName(l.operatorId)}, planned ${range(l.plannedDeparture, l.plannedArrival)}`,
    events: byLeg[i],
  }));
  if (customs)
    out.splice(legs.length - 1, 0, {
      key: "customs",
      done: customsEvents.length > 0,
      title: "Import customs",
      meta: customsEvents.length ? undefined : "Pending",
      events: customsEvents,
    });
  return out;
}

export function Timeline({ v }: { v: ShipmentView }) {
  return (
    <ol>
      {steps(v).map((s, i, all) => (
        <li key={s.key} className={`relative pb-6 pl-6 ${i < all.length - 1 ? "border-l" : ""} ${s.done ? "border-ink-2" : "border-line"}`}>
          <span
            className={`absolute -left-[5px] top-1 size-[9px] rounded-full ${
              s.events.some((e) => BAD_CODES.includes(e.code)) ? "bg-bad" : s.done ? "bg-ink-2" : "border border-line-strong bg-white"
            }`}
            aria-hidden
          />
          <p className={`font-semibold ${s.done ? "" : "text-ink-2"}`}>{s.title}</p>
          {s.meta && <p className="text-xs text-ink-2">{s.meta}</p>}
          {s.events.length > 0 && (
            <ul className="mt-2 space-y-1">
              {s.events.map((e) => (
                <li key={e.source.rawId} className="flex flex-wrap gap-x-3">
                  <span className="w-24 shrink-0 text-ink-2">{dayTime(e.at)}</span>
                  <span className={BAD_CODES.includes(e.code) ? "font-semibold text-bad" : ""}>{CODE[e.code]}</span>
                  <span className="text-ink-2">{e.location}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

export function Documents({ v }: { v: ShipmentView }) {
  return (
    <ul className="space-y-1.5">
      {v.shipment.documents.map((d) => (
        <li key={d.name} className="flex justify-between gap-3">
          {d.name}
          {d.status === "missing" ? <span className="font-semibold text-bad">Missing</span> : <span className="text-ink-2">Available</span>}
        </li>
      ))}
    </ul>
  );
}

export function Header({ who, role }: { who: string; role: string }) {
  return (
    <header className="bg-sunken">
      <div className="mx-auto flex max-w-5xl flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3 md:px-6">
        <p>
          <span className="font-semibold">Shipment Tracking</span> <span className="ml-2 text-ink-2">{role}</span>
        </p>
        <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="font-semibold">{who}</span>
          <span className="text-xs text-ink-2">Demo clock {dayTime(DEMO_NOW)} UTC</span>
          <Link href="/" className="text-accent hover:underline">Switch persona</Link>
        </p>
      </div>
    </header>
  );
}

// Shared table cell styles so customer and ops tables stay one pattern.
export const th = "px-3 py-2 text-left text-xs font-semibold text-ink-2 whitespace-nowrap";
export const td = "px-3 py-2 align-baseline whitespace-nowrap";
