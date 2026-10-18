import { Ship, Truck } from "lucide-react";
import { toEvents, type RawEvent } from "./adapters";
import { accounts, extractions, operators, personas, predictions, rawEvents, script, sites } from "./data";
import { DEMO_NOW, view, type Code, type Persona, type Shipment, type ShipmentView, type Status, type TrackingEvent } from "./domain";

export const customers = personas.filter((p) => p.role === "customer");
export const customerPersona = (account: string) => customers.find((p) => p.accountIds?.includes(account));

export const opsTeams = personas.filter((p) => p.role === "operations");
export const opsPersona = (team: string) => opsTeams.find((p) => p.id === team);

// Demo state the reviewer changes. Clock and injected events derive from `step`.
export type Review = "approved" | "rejected";
export type Demo = { step: number; reviews: Record<string, Review>; uploaded: string[]; open: boolean };
export const INITIAL: Demo = { step: 0, reviews: {}, uploaded: [], open: false };
export const touched = (d: Demo) => d.step > 0 || Object.keys(d.reviews).length > 0 || d.uploaded.length > 0;

export function played(d: Demo) {
  const steps = script.slice(0, d.step);
  return {
    now: steps.at(-1)?.now ?? DEMO_NOW,
    raws: [...rawEvents, ...steps.flatMap((s) => s.raw ?? [])],
    predictions: Object.assign({}, predictions, ...steps.map((s) => s.predictions)),
    approved: Object.keys(d.reviews).filter((id) => d.reviews[id] === "approved"),
  };
}

// Uploaded documents are keyed "ref/name": the same document name exists on several shipments.
export const shipmentViews = (list: Shipment[], d: Demo = INITIAL) => {
  const { now, raws, predictions, approved } = played(d);
  const events = toEvents(raws, extractions, approved);
  return list.map((s) => {
    const documents = s.documents.map((doc) => (d.uploaded.includes(`${s.ref}/${doc.name}`) ? { ...doc, status: "available" as const } : doc));
    return view({ ...s, documents }, events, predictions[s.ref], now);
  });
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
const ago = (iso: string, now: string) => {
  const h = Math.floor((Date.parse(now) - Date.parse(iso)) / 3_600_000);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
};

const nameOf = (list: { id: string; name: string }[]) => (id: string) => list.find((x) => x.id === id)?.name ?? id;
export const operatorName = nameOf(operators);
export const siteName = nameOf(sites);
export const accountName = nameOf(accounts);

export const personaHref = (p: Persona) =>
  p.role === "customer" ? `/customer/${p.accountIds![0]}/shipments` : `/operations/${p.id}/exceptions`;

export const perimeter = (p: Persona) =>
  p.siteIds ? `Shipments leaving ${p.siteIds.map(siteName).join(", ")}` : `Shipments for ${p.accountIds!.map(accountName).join(" and ")}`;

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
export const statusLabel = (s: Status) => STATUS[s][0];

export function StatusBadge({ v }: { v: ShipmentView }) {
  const [text, color] = STATUS[v.status];
  const label = v.status === "stale" ? `${text} ${ago(v.silentSince, v.now)}` : text;
  return (
    <span className={`inline-flex items-center gap-2 font-semibold whitespace-nowrap ${color}`}>
      <span className="size-2 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

// Where the shipment is, from the last confirmed event only.
function stateSentence(v: ShipmentView) {
  const e = v.last;
  if (!e) return `Booked, pickup planned ${dayTime(v.shipment.legs[0].plannedDeparture)}`;
  return `${CODE[e.code]}, ${e.location} ${e.code === "DELIVERED" ? "on" : "since"} ${dayTime(e.at)}`;
}

// Operator emails whose AI reading is still waiting for a human.
export const pendingEmails = (ref: string, d: Demo = INITIAL) =>
  played(d).raws.filter((r) => r.shipmentRef === ref && extractions[r.id] && !d.reviews[r.id] && !toEvents([r], extractions).length);

export function latestMessage(items: { operatorId: string; receivedAt: string }[]) {
  const m = items.toSorted((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt)).at(-1);
  return m && `Latest operator message from ${operatorName(m.operatorId)}, sent ${dayTime(m.receivedAt)}.`;
}

// What ops should do first. A pending email comes first: its facts may change everything else.
export function nextAction(v: ShipmentView, pending?: RawEvent) {
  if (pending) return `Review ${operatorName(pending.operatorId)} email`;
  const e = v.exceptions[0];
  if (!e) return undefined;
  if (e.action === "upload_document") return `Upload ${v.shipment.documents.find((d) => d.status === "missing")!.name.toLowerCase()}`;
  if (e.action === "contact_operator") return `Contact ${operatorName(v.last?.source.operatorId ?? v.shipment.legs[0].operatorId)}`;
  return "Send customer update";
}

export const readAs = (e: Pick<TrackingEvent, "code" | "kind" | "at" | "location">) =>
  `${e.kind === "estimate" ? "Estimated arrival" : CODE[e.code]}, ${e.location}, ${dayTime(e.at)}`;

// One plain sentence per shipment, from the most severe exception the customer should know about.
export function customerAlert(v: ShipmentView) {
  const missing = v.shipment.documents.filter((d) => d.status === "missing").map((d) => d.name.toLowerCase());
  for (const e of v.exceptions) {
    if (e.type === "customs_hold")
      return missing.length
        ? `Customs needs the ${missing.join(" and ")}. We are filing it with the broker.`
        : "Held at customs. We are in contact with the broker.";
    if (e.type === "delivery_failed") return "Delivery attempt failed. We are rebooking it with the carrier.";
    if (e.type === "stale") return `No update from the carrier for ${ago(v.silentSince, v.now)}. We are checking with them.`;
    if (e.type === "delay") return `Expected after the promised date of ${day(v.shipment.promisedDate)}.`;
    if (e.type === "at_risk" && v.eta.predicted)
      return `May arrive after the promised date. Calculated estimate ${range(v.eta.predicted.from, v.eta.predicted.to)}.`;
  }
}

const Late = ({ iso, promised }: { iso: string; promised: string }) => {
  const d = Math.ceil((Date.parse(iso) - Date.parse(promised)) / 86_400_000);
  return d > 0 ? <span className="font-semibold text-bad">+{d}d</span> : null;
};

// Best-known arrival, with the word that says where it comes from.
export function Expected({ v }: { v: ShipmentView }) {
  if (v.eta.actual) return <>Delivered {day(v.eta.actual)}</>;
  const iso = v.eta.expected;
  return (
    <>
      <span className="text-ink-2">{v.eta.carrier ? "Carrier" : "Planned"}</span> {day(iso)}{" "}
      <Late iso={iso} promised={v.shipment.promisedDate} />
    </>
  );
}

export const etaSource = ({ eta: { carrierSource: src } }: ShipmentView) =>
  src ? `${operatorName(src.operatorId)}, sent ${dayTime(src.receivedAt)}` : "Booking plan, no carrier estimate yet";

const Dot = ({ filled }: { filled: boolean }) => (
  <span className={`size-2 shrink-0 rounded-full ${filled ? "bg-ink" : "border border-line-strong"}`} aria-hidden />
);

export const Term = ({ children }: { children: React.ReactNode }) => (
  <dt className="text-xs font-semibold text-ink-2">{children}</dt>
);

// Promised, then carrier, calculated and actual. Each layer looks different and names its source.
function Eta({ v }: { v: ShipmentView }) {
  const { promisedDate } = v.shipment;
  const src = v.eta.carrierSource;
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
              {day(v.eta.expected)} <Late iso={v.eta.expected} promised={promisedDate} />
            </dd>
            <dd className="text-xs text-ink-2">{etaSource(v)}</dd>
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
      <span className="flex items-center gap-2">
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
            className={`absolute -left-1 top-1 size-2 rounded-full ${
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

function Documents({ v, onUpload }: { v: ShipmentView; onUpload?: (name: string) => void }) {
  return (
    <ul className="space-y-2">
      {v.shipment.documents.map((d) => (
        <li key={d.name} className="flex flex-wrap items-baseline justify-between gap-x-3">
          {d.name}
          {d.status === "available" ? (
            <span className="text-ink-2">Available</span>
          ) : (
            <span className="flex items-baseline gap-3">
              <span className="font-semibold text-bad">Missing</span>
              {onUpload && (
                <label className="-my-1 cursor-pointer py-1 text-accent hover:underline focus-within:outline-2 focus-within:outline-accent">
                  Upload
                  <input type="file" className="sr-only" onChange={(e) => e.target.files?.length && onUpload(d.name)} />
                </label>
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// Head of a shipment detail page: where it is now, then ref and route.
export function ShipmentHead({ v, lead, children }: { v: ShipmentView; lead?: string; children?: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-xl font-semibold">{stateSentence(v)}</h1>
        <StatusBadge v={v} />
      </div>
      <p className="mt-1 text-ink-2">
        <span className="mr-2 font-mono text-ink">{v.shipment.ref}</span>
        {lead && `${lead}, `}{siteName(v.shipment.originSiteId)} → {v.shipment.destination}
      </p>
      {children}
    </div>
  );
}

// Detail body: page-specific main column, arrival and documents on the side.
export function ShipmentBody({ v, onUpload, side, children }: { v: ShipmentView; onUpload?: (name: string) => void; side?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-8 grid gap-10 md:grid-cols-[1fr_18rem]">
      <div className="flex flex-col gap-10">{children}</div>
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 font-semibold">Arrival</h2>
          <Eta v={v} />
        </section>
        <section id="documents">
          <h2 className="mb-3 font-semibold">Documents</h2>
          <Documents v={v} onUpload={onUpload} />
        </section>
        {side}
      </div>
    </div>
  );
}

// Shared table cell styles so customer and ops tables stay one pattern.
export const th = "px-3 py-2 text-left text-xs font-semibold text-ink-2 whitespace-nowrap";
export const td = "px-3 py-2 align-baseline whitespace-nowrap";
