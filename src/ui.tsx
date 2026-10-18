import { Ship, Truck } from "lucide-react";
import { toEvents, type RawEvent } from "./adapters";
import { accounts, extractions, operators, personas, predictions, rawEvents, script, sites } from "./data";
import { DEMO_NOW, view, type Code, type Mode, type Named, type Persona, type Prediction, type Shipment, type ShipmentView, type Status, type TrackingEvent } from "./domain";

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

const nameOf = (list: Named[]) => (id: string) => list.find((x) => x.id === id)?.name ?? id;
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
  on_track: ["On track", "text-ink"],
  at_risk: ["At risk", "text-warn"],
  delayed: ["Delayed", "text-bad"],
  on_hold: ["On hold", "text-bad"],
  stale: ["No signal", "text-stale"],
  delivered: ["Delivered", "text-ok"],
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
    if (e.type === "stale") return `No update from the carrier since ${dayTime(v.silentSince)}. We are checking with them.`;
    if (e.type === "delay") return `Expected after the promised date of ${day(v.shipment.promisedDate)}.`;
    if (e.type === "at_risk" && v.eta.predicted)
      return `May arrive after the promised date. Calculated estimate ${range(v.eta.predicted.from, v.eta.predicted.to)}.`;
  }
}

const Late = ({ iso, promised }: { iso: string; promised: string }) => {
  const d = Math.ceil((Date.parse(iso) - Date.parse(promised)) / 86_400_000);
  return d > 0 ? <span className="font-semibold text-bad">+{d}d</span> : null;
};

const BASIS = { carrier: "Carrier", planned: "Planned", calculated: "Calculated" } as const;
const SOURCE = { carrier: "carrier estimate", planned: "booking plan", calculated: "calculated by AI" } as const;

// The expected date as text: one day, or the calculated range.
export const expectedText = (v: ShipmentView) =>
  v.eta.basis === "calculated" ? range(v.eta.predicted!.from, v.eta.predicted!.to) : v.eta.expected && day(v.eta.expected);

// Best date we can stand behind, with the word that says where it comes from. Never a plan that no longer holds.
export function Expected({ v }: { v: ShipmentView }) {
  if (v.eta.actual) return <>Delivered {day(v.eta.actual)}</>;
  if (!v.eta.basis) return <span className="text-ink-2">Unknown</span>;
  return (
    <>
      <span className="text-ink-2">{BASIS[v.eta.basis]}</span> {expectedText(v)}{" "}
      <Late iso={v.eta.expected!} promised={v.shipment.promisedDate} />
    </>
  );
}

const calculatedBy = (p: Prediction) => `Calculated by AI from ${p.sample} past shipments on this lane`;

// Why the booking plan stopped being a valid date.
function planBroken(v: ShipmentView) {
  if (v.status === "on_hold") return "held at customs";
  if (v.last?.code === "DELIVERY_FAILED") return "the delivery attempt failed";
  if (v.status === "stale")
    return v.events.length ? `no update from the carrier since ${dayTime(v.silentSince)}` : `pickup planned ${dayTime(v.silentSince)} not confirmed`;
  return "the shipment is behind the booking plan";
}

const sentBy = (e: TrackingEvent) => `${operatorName(e.source.operatorId)}, sent ${dayTime(e.source.receivedAt)}`;

// Where the expected date comes from, in one sentence.
export function etaSource(v: ShipmentView) {
  if (v.eta.basis === "carrier") return sentBy(v.eta.carrierEstimate!);
  if (v.eta.basis === "planned") return "Booking plan, no carrier estimate yet";
  if (v.eta.basis === "calculated") return calculatedBy(v.eta.predicted!);
  return `No reliable date yet: ${planBroken(v)}`;
}

// A carrier estimate for an earlier leg only covers that point; the rest of the date is plan.
export const carrierScope = ({ eta: { carrierEstimate: e }, shipment }: ShipmentView) =>
  e && e.leg! < shipment.legs.length - 1 ? `Covers ${e.location}, ${dayTime(e.at)}. Later legs follow the booking plan.` : undefined;

const Dot = ({ filled }: { filled: boolean }) => (
  <span className={`size-2 shrink-0 rounded-full ${filled ? "bg-ink" : "border border-line-strong"}`} aria-hidden />
);

export const Term = ({ children }: { children: React.ReactNode }) => (
  <dt className="text-xs font-semibold text-ink-2">{children}</dt>
);

// Promised, then carrier, calculated and actual. Each layer looks different and names its source.
function Eta({ v }: { v: ShipmentView }) {
  const { promisedDate } = v.shipment;
  const { basis, planHolds, planned, carrier, predicted: p } = v.eta;
  const scope = carrierScope(v);
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
          {/* Shown even when it is only a floor and the calculated range below is the expected date. */}
          {carrier ? (
            <div>
              <Term>Carrier estimate</Term>
              <dd className="flex items-center gap-2">
                <Dot filled={false} />
                {day(carrier)} <Late iso={carrier} promised={promisedDate} />
              </dd>
              <dd className="text-xs text-ink-2">{sentBy(v.eta.carrierEstimate!)}</dd>
              {scope && <dd className="text-xs text-ink-2">{scope}</dd>}
            </div>
          ) : (
            <div>
              <Term>Planned</Term>
              <dd className={`flex items-center gap-2 ${planHolds ? "" : "text-ink-2 line-through"}`}>
                <Dot filled={false} />
                {day(planned)} {planHolds && <Late iso={planned} promised={promisedDate} />}
              </dd>
              <dd className="text-xs text-ink-2">{planHolds ? etaSource(v) : `No longer holds: ${planBroken(v)}.`}</dd>
            </div>
          )}
          {p && (
            <div>
              <Term>Calculated estimate</Term>
              <dd className="mt-1 border border-dashed border-line-strong px-3 py-2">
                {range(p.from, p.to)} <Late iso={p.to} promised={promisedDate} />
                <p className="mt-1 text-xs text-ink-2">
                  {calculatedBy(p)}. {p.confidence[0].toUpperCase() + p.confidence.slice(1)} confidence.
                </p>
                <details className="text-xs text-ink-2">
                  <summary className="cursor-pointer py-1 text-accent hover:underline">See why</summary>
                  <p>8 in 10 of those shipments arrived within this range.</p>
                  <ul className="mt-1 list-disc pl-4">{p.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  <p className="mt-1">{p.updates}</p>
                </details>
              </dd>
            </div>
          )}
          {!basis && (
            <div>
              <Term>Expected</Term>
              <dd className="font-semibold">Unknown</dd>
              <dd className="text-xs text-ink-2">No carrier estimate and no calculated range yet.</dd>
            </div>
          )}
        </>
      )}
    </dl>
  );
}

const ModeIcon = ({ mode }: { mode: Mode }) =>
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
              s.events.some((e) => BAD_CODES.includes(e.code)) ? "bg-bad" : s.done ? "bg-ink-2" : "border border-line-strong bg-surface"
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

// Available files download (one synthetic PDF stands in for all). Missing ones say what they block.
function Documents({ v, onUpload }: { v: ShipmentView; onUpload?: (name: string) => void }) {
  return (
    <ul className="space-y-2">
      {v.shipment.documents.map((d) =>
        d.status === "available" ? (
          <li key={d.name} className="flex items-baseline justify-between gap-x-3">
            <a href="/sample-document.pdf" download={`${v.shipment.ref} ${d.name}.pdf`} className="-my-1 py-1 text-accent hover:underline">
              {d.name}
            </a>
            <span className="text-xs text-ink-2">PDF</span>
          </li>
        ) : (
          <li key={d.name}>
            <div className="flex items-baseline justify-between gap-x-3">
              {d.name}
              {onUpload ? (
                <span className="flex items-baseline gap-3">
                  <span className="font-semibold text-bad">Missing</span>
                  <label className="-my-1 cursor-pointer py-1 text-accent hover:underline focus-within:outline-2 focus-within:outline-accent">
                    Upload
                    <input type="file" className="sr-only" onChange={(e) => e.target.files?.length && onUpload(d.name)} />
                  </label>
                </span>
              ) : (
                <span className="font-semibold text-bad">Pending</span>
              )}
            </div>
            {!onUpload && (
              <p className="text-xs text-ink-2">
                {v.shipment.customs ? "Customs needs it to clear the shipment." : "We are preparing it."}
              </p>
            )}
          </li>
        ),
      )}
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
      {!v.eta.actual && (
        <p className="mt-3">
          Promised {day(v.shipment.promisedDate)}.{" "}
          {v.eta.basis ? (
            <>
              Expected <span className="font-semibold">{expectedText(v)}</span>{" "}
              <Late iso={v.eta.expected!} promised={v.shipment.promisedDate} />{" "}
              <span className="text-ink-2">({SOURCE[v.eta.basis]})</span>
            </>
          ) : (
            "Expected date unknown."
          )}
        </p>
      )}
      {children}
    </div>
  );
}

// Detail body: page-specific main column, arrival and documents on the side. `side` (the customer map) leads the
// side column on desktop and goes last on phones, below the fold, so MapLibre stays off the first load.
export function ShipmentBody({ v, onUpload, side, children }: { v: ShipmentView; onUpload?: (name: string) => void; side?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-8 grid gap-10 md:grid-cols-[1fr_18rem]">
      <div className="flex flex-col gap-10">{children}</div>
      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-3 text-base font-semibold">Arrival</h2>
          <Eta v={v} />
        </section>
        <section id="documents">
          <h2 className="mb-3 text-base font-semibold">Documents</h2>
          <Documents v={v} onUpload={onUpload} />
        </section>
        {side && <div className="md:-order-1">{side}</div>}
      </div>
    </div>
  );
}

// Shared button style. Lives here, not in live.tsx: server pages cannot read values from a client module.
export const button =
  "border border-ink-2 px-3 py-1 font-semibold hover:border-ink active:bg-line disabled:cursor-not-allowed disabled:border-line disabled:text-ink-2";

// Shared table cell styles so customer and ops tables stay one pattern.
export const th = "px-3 py-2 text-left text-xs font-semibold text-ink-2 whitespace-nowrap";
export const td = "px-3 py-2 align-baseline whitespace-nowrap";
