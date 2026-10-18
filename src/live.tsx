"use client";
// Everything that reads the demo state. Pages stay server shells and pass ids and shipments in.
import { Menu, Moon } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Fragment, useCallback, useState, useSyncExternalStore } from "react";
import { AUTO_APPLY, normalize, type RawEvent } from "./adapters";
import { briefings, chases, drafts, extractions, personas, script, shipments } from "./data";
import { DEMO_NOW, visible, type Shipment, type ShipmentView, type Status } from "./domain";
import {
  accountName, button, carrierScope, customerAlert, day, dayTime, etaSource, Expected, expectedText, INITIAL, latestMessage, nextAction, operatorName, pendingEmails, personaHref,
  played, readAs, ShipmentBody, ShipmentHead, shipmentViews, siteName, statusLabel, StatusBadge, td, Term, th, Timeline, touched,
  type Demo, type Review,
} from "./ui";

// Store: localStorage so the state survives reloads and persona switches; the storage event syncs other windows.
// `open` starts closed on every load and stays per window: a strip opening after hydration would shift the page.
const KEY = "demo-v1";
const listeners = new Set<() => void>();
let state: Demo | undefined;

function read(): Demo {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? { ...INITIAL, ...JSON.parse(saved), open: false } : INITIAL;
  } catch {
    return INITIAL;
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key === "theme" && e.newValue) document.documentElement.dataset.theme = e.newValue;
    else if (e.key === KEY) state = { ...read(), open: state?.open ?? false };
    else return;
    listeners.forEach((fn) => fn());
  });

function setDemo(next: Demo) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((fn) => fn());
}

const useDemo = () => useSyncExternalStore(subscribe, () => (state ??= read()), () => INITIAL);

// Saved choice or system theme before first paint; text/plain on the client so React does not warn.
export const ThemeScript = () => (
  <script
    type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
    suppressHydrationWarning
    dangerouslySetInnerHTML={{
      __html: `try{document.documentElement.dataset.theme=localStorage.getItem("theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch(e){}`,
    }}
  />
);

// The theme lives on <html data-theme>; it changes only here and in the storage listener, which notify the same store.
const useTheme = () => useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme, () => undefined);

export function ThemeToggle() {
  const dark = useTheme() === "dark";
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
    listeners.forEach((fn) => fn());
  };
  return (
    <button type="button" aria-label="Dark theme" aria-pressed={dark} onClick={toggle} className="-m-1 p-1 hover:text-accent aria-pressed:text-accent">
      <Moon size={20} aria-hidden />
    </button>
  );
}

// MapLibre needs window and weighs ~230 KB gzip: client only, fetched on customer detail pages.
const RouteMap = dynamic(() => import("./map"), { ssr: false });


// Stable ref callback: runs once on mount, taking focus from a control that just disappeared or got disabled.
const focusOnMount = (el: HTMLElement | null) => el?.focus();

// Mobile folds persona, clock and switch into a native <details> menu; the demo toggle stays visible.
export function Header({ who, role }: { who: string; role: string }) {
  const d = useDemo();
  const clock = `Demo clock ${dayTime(played(d).now)} UTC`;
  const switchLink = <Link href="/" className="py-1 text-accent hover:underline">Switch persona</Link>;
  return (
    <header className="bg-sunken">
      <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-x-6 px-4 py-3 md:px-6">
        <p className="whitespace-nowrap">
          <span className="mr-2 hidden font-semibold sm:inline">Shipment Tracking</span>
          <span className="font-semibold sm:font-normal sm:text-ink-2">{role}</span>
        </p>
        <div className="flex items-center gap-x-3 whitespace-nowrap lg:gap-x-6">
          <span className="hidden font-semibold lg:inline">{who}</span>
          <span className="hidden text-xs text-ink-2 lg:inline">{clock}</span>
          <button type="button" aria-expanded={d.open} aria-controls="demo" onClick={() => setDemo({ ...d, open: !d.open })} className={button}>
            {d.open ? "Hide demo" : "Run demo"}
          </button>
          <ThemeToggle />
          <span className="hidden lg:inline">{switchLink}</span>
          <details className="lg:hidden">
            <summary aria-label="Menu" className="-m-1 flex cursor-pointer list-none p-1 hover:text-accent [&::-webkit-details-marker]:hidden">
              <Menu size={20} aria-hidden />
            </summary>
            <div className="absolute inset-x-0 top-full z-10 space-y-1 border-b border-line bg-sunken px-4 pb-3">
              <p className="font-semibold">{who}</p>
              <p className="text-xs text-ink-2">{clock}</p>
              <p className="pt-1">{switchLink}</p>
            </div>
          </details>
        </div>
      </div>
      {d.open && <DemoStrip d={d} />}
    </header>
  );
}

// What the last step changed, diffed from the views before it. Never written by hand.
function changes(d: Demo) {
  const step = script[d.step - 1];
  if (!step) return { lines: ["Nothing sent yet."], seen: [] };
  const seenBy = (ref: string, opsOnly = false) =>
    personas.filter((p) => (!opsOnly || p.role === "operations") && visible(p, shipments).some((s) => s.ref === ref));
  const out = withWas(shipments, d).flatMap(({ v, was }) =>
    was && seenBy(v.shipment.ref).length
      ? [{ text: `${v.shipment.ref} is now ${statusLabel(v.status)}, was ${statusLabel(was)}.`, seen: seenBy(v.shipment.ref) }]
      : [],
  );
  const raw = step.raw;
  if (raw && pendingEmails(raw.shipmentRef, d).some((r) => r.id === raw.id))
    out.push({
      text: `${raw.shipmentRef}: ${operatorName(raw.operatorId)} email waiting for review. Customers see no change until it is approved.`,
      seen: seenBy(raw.shipmentRef, true),
    });
  return { lines: out.length ? out.map((o) => o.text) : ["No status changed."], seen: [...new Set(out.flatMap((o) => o.seen))] };
}

// Reset unmounts its own button, so focus moves to Send once it has re-rendered.
function reset() {
  setDemo({ ...INITIAL, open: true });
  requestAnimationFrame(() => document.getElementById("demo-send")?.focus());
}

function DemoStrip({ d }: { d: Demo }) {
  const next = script[d.step];
  const { lines, seen } = changes(d);
  return (
    <section id="demo" aria-label="Demo" className="mx-auto grid max-w-5xl gap-x-10 gap-y-4 px-4 pb-4 md:grid-cols-2 md:px-6">
      <div>
        <h2 className="text-base font-semibold">Demo</h2>
        <p className="max-w-prose text-ink-2">
          Scripted operator messages for this prototype, not part of the product. Each one moves the demo clock and runs through the same
          pipeline as the rest of the data. In production they arrive by API, EDI and email.
        </p>
        <ol className="mt-3 space-y-1">
          {script.map((s, i) => (
            <li key={s.now} className={i < d.step ? "text-ink-2" : i === d.step ? "font-semibold" : ""}>
              {dayTime(s.now)} {s.note}
              {i < d.step && " Sent."}
            </li>
          ))}
        </ol>
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <button id="demo-send" type="button" disabled={!next} onClick={() => setDemo({ ...d, step: d.step + 1 })} className={button}>
            {!next ? "All updates sent" : next.raw ? `Send ${dayTime(next.now)} update` : `Advance clock to ${dayTime(next.now)}`}
          </button>
          {touched(d) && (
            <button type="button" onClick={reset} className="py-1 text-accent hover:underline">
              Reset demo
            </button>
          )}
        </div>
        <div role="status" tabIndex={-1} ref={next ? undefined : focusOnMount} className="mt-3 space-y-1">
          {lines.map((l) => <p key={l}>{l}</p>)}
          {seen.length > 0 && (
            <p className="text-ink-2">
              Seen by{" "}
              {seen.map((p, i) => (
                <Fragment key={p.id}>
                  {i > 0 && ", "}
                  <Link href={personaHref(p)} className="text-accent hover:underline">{p.name}</Link>
                </Fragment>
              ))}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// Section of the ops detail page where the next action is done.
const TARGET: Record<string, string> = { upload_document: "documents", notify_customer: "update", contact_operator: "contact" };
const actionTarget = (v: ShipmentView, pending: RawEvent[]) => (pending.length ? "messages" : TARGET[v.exceptions[0]?.action ?? ""]);

// Each view with the status it had before the last demo step, when that changed.
function withWas(list: Shipment[], d: Demo) {
  const views = shipmentViews(list, d);
  const before = d.step ? shipmentViews(list, { ...d, step: d.step - 1 }) : views;
  return views.map((v, i) => ({ v, was: before[i].status !== v.status ? before[i].status : undefined }));
}

const Was = ({ status }: { status?: Status }) => status && <span className="block text-xs text-ink-2">Was {statusLabel(status)}</span>;

export function CustomerList({ account, list }: { account: string; list: Shipment[] }) {
  const rows = withWas(list, useDemo()).map((r) => ({ ...r, alert: customerAlert(r.v) })).toSorted((a, b) => +!a.alert - +!b.alert);
  const flagged = rows.filter((r) => r.alert).length;
  return (
    <>
      <p role="status" className="text-ink-2">
        {flagged === 0
          ? `All ${rows.length} shipments on track.`
          : `${flagged} of ${rows.length} shipments ${flagged === 1 ? "needs" : "need"} attention.`}{" "}
        {latestMessage(rows.flatMap((r) => r.v.events.map((e) => e.source)))}
      </p>
      <table className="mt-6 w-full">
        <thead className="bg-sunken">
          <tr>
            <th className={th}>Shipment</th>
            <th className={`${th} hidden sm:table-cell`}>Destination</th>
            <th className={`${th} hidden text-right! sm:table-cell`}>Promised</th>
            <th className={`${th} text-right!`}>Expected</th>
            <th className={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ v, was, alert }) => (
            <Fragment key={v.shipment.ref}>
              <tr className={alert ? "" : "border-b border-line"}>
                <td className={td}>
                  <Link href={`/customer/${account}/shipments/${v.shipment.ref}`} className="font-mono text-accent hover:underline">
                    {v.shipment.ref}
                  </Link>
                </td>
                <td className={`${td} hidden sm:table-cell`}>{v.shipment.destination}</td>
                <td className={`${td} hidden text-right sm:table-cell`}>{day(v.shipment.promisedDate)}</td>
                <td className={`${td} text-right`}><Expected v={v} /></td>
                <td className={td}><StatusBadge v={v} /><Was status={was} /></td>
              </tr>
              {alert && (
                <tr className="border-b border-line">
                  <td colSpan={5} className="pr-3 pb-3 pl-6">{alert}</td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      <Ask account={account} views={rows.map((r) => r.v)} />
    </>
  );
}

// Scripted questions. Every answer is built from the same views as the table above.
function Ask({ account, views }: { account: string; views: ShipmentView[] }) {
  const ref = (v: ShipmentView) => (
    <Link href={`/customer/${account}/shipments/${v.shipment.ref}`} className="font-mono text-accent hover:underline">{v.shipment.ref}</Link>
  );
  const late = views.filter((v) => v.exceptions.some((e) => e.type === "delay" || e.type === "at_risk" || e.type === "stale"));
  const next = views
    .filter((v) => !v.eta.actual && v.eta.expected)
    .toSorted((a, b) => Date.parse(a.eta.expected!) - Date.parse(b.eta.expected!))[0];
  const latest = views
    .flatMap((v) => v.events.map((e) => ({ v, e })))
    .toSorted((a, b) => Date.parse(a.e.source.receivedAt) - Date.parse(b.e.source.receivedAt))
    .at(-1);
  const qa: [string, React.ReactNode][] = [
    [
      "Will anything arrive late?",
      late.length
        ? late.map((v) => <p key={v.shipment.ref}>{ref(v)}: {customerAlert(v)}</p>)
        : `None. All ${views.length} are expected by the promised date.`,
    ],
    [
      "What arrives next?",
      next ? (
        <>
          {ref(next)} to {next.shipment.destination}, expected {expectedText(next)}. {etaSource(next)}. {next.eta.basis === "carrier" && carrierScope(next)} {customerAlert(next)}
        </>
      ) : (
        `Nothing. All ${views.length} shipments are delivered.`
      ),
    ],
    [
      "What is the latest update?",
      latest ? (
        <>{ref(latest.v)}: {readAs(latest.e)}. From {operatorName(latest.e.source.operatorId)}, sent {dayTime(latest.e.source.receivedAt)}.</>
      ) : (
        "No updates yet."
      ),
    ],
    ["Can you check a shipment that is not on this list?", `I can only see your shipments, the ${views.length} in the table above.`],
  ];
  return (
    <section className="mt-8 max-w-prose">
      <h2 className="mb-3 text-base font-semibold">Questions about your shipments</h2>
      <div className="space-y-2">
        {qa.map(([q, a]) => (
          <details key={q} name="ask" className="group">
            <summary className={`${button} inline-block cursor-pointer list-none group-open:border-ink [&::-webkit-details-marker]:hidden`}>{q}</summary>
            <div className="mt-2 mb-2 border border-dashed border-line-strong px-4 py-3">
              <p className="text-xs text-ink-2">Answered by AI from the shipments above, as of {dayTime(views[0].now)}.</p>
              <div className="mt-1 space-y-1">{a}</div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

export function CustomerShipment({ shipment }: { shipment: Shipment }) {
  const [v] = shipmentViews([shipment], useDemo());
  const alert = customerAlert(v);
  const theme = useTheme();
  // MapLibre loads once the map scrolls into view: below the fold on phones, it stays off the critical path.
  const [mapOn, setMapOn] = useState(false);
  const watchMap = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      setMapOn(true);
      io.disconnect();
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <>
      <ShipmentHead v={v}>{alert && <p className="mt-3 max-w-prose">{alert}</p>}</ShipmentHead>
      <ShipmentBody
        v={v}
        side={
          <section>
            <h2 className="mb-3 text-base font-semibold">Map</h2>
            <div ref={watchMap} className="relative aspect-[4/3] bg-sunken md:aspect-square" aria-hidden>
              {/* Covered by the opaque tiles once they load. */}
              <span className="absolute inset-0 grid place-items-center text-xs text-ink-2">Loading map…</span>
              {mapOn && <RouteMap key={`${theme} ${v.events.filter((e) => e.kind === "actual").map((e) => e.source.rawId).join()}`} v={v} />}
            </div>
            <p className="mt-2 text-xs text-ink-2">
              Solid: confirmed by tracking events. Dotted: planned, still to go. Ring: destination. No live vessel position.{" "}
              <a href="https://openfreemap.org" className="text-accent underline">OpenFreeMap</a>{" "}
              <a href="https://www.openmaptiles.org/" className="text-accent underline">© OpenMapTiles</a>, data{" "}
              <a href="https://www.openstreetmap.org/copyright" className="text-accent underline">© OpenStreetMap contributors</a>
            </p>
          </section>
        }
      >
        <section>
          <h2 className="mb-4 text-base font-semibold">Journey</h2>
          <Timeline v={v} />
        </section>
      </ShipmentBody>
    </>
  );
}

export function OpsExceptions({ team, list }: { team: string; list: Shipment[] }) {
  const d = useDemo();
  const rows = withWas(list, d)
    .map((r) => {
      const pending = pendingEmails(r.v.shipment.ref, d);
      return { ...r, action: nextAction(r.v, pending[0]), target: actionTarget(r.v, pending) };
    })
    .toSorted((a, b) => (b.v.exceptions[0]?.severity ?? 0) - (a.v.exceptions[0]?.severity ?? 0));
  const open = rows.filter((r) => r.action).length;
  const refs = list.map((s) => s.ref);
  return (
    <>
      <p role="status" className="text-ink-2">
        {open === 0 ? "No shipments need action." : `${open} of ${rows.length} shipments need action, most severe first.`}{" "}
        {latestMessage(played(d).raws.filter((r) => refs.includes(r.shipmentRef)))}
      </p>

      <table className="mt-6 w-full">
        <thead className="bg-sunken">
          <tr>
            <th className={th}>Shipment</th>
            <th className={`${th} hidden md:table-cell`}>Customer</th>
            <th className={`${th} hidden lg:table-cell`}>Route</th>
            <th className={`${th} hidden text-right! lg:table-cell`}>Promised</th>
            <th className={`${th} hidden text-right! sm:table-cell`}>Expected</th>
            <th className={th}>Status</th>
            <th className={th}>Next action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ v, was, action, target }) => (
            <tr key={v.shipment.ref} className="border-b border-line">
              <td className={td}>
                <Link href={`/operations/${team}/shipments/${v.shipment.ref}`} className="font-mono text-accent hover:underline">
                  {v.shipment.ref}
                </Link>
              </td>
              <td className={`${td} hidden md:table-cell`}>{accountName(v.shipment.accountId)}</td>
              <td className={`${td} hidden lg:table-cell`}>{siteName(v.shipment.originSiteId)} → {v.shipment.destination}</td>
              <td className={`${td} hidden text-right lg:table-cell`}>{day(v.shipment.promisedDate)}</td>
              <td className={`${td} hidden text-right sm:table-cell`}><Expected v={v} /></td>
              <td className={td}><StatusBadge v={v} /><Was status={was} /></td>
              <td className={`${td} whitespace-normal!`}>
                {!action ? (
                  <span className="text-ink-2">None</span>
                ) : (
                  <Link href={`/operations/${team}/shipments/${v.shipment.ref}#${target}`} className="text-accent hover:underline">{action}</Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-8 max-w-prose border border-dashed border-line-strong px-4 py-3">
        <h2 className="text-xs font-semibold text-ink-2">Briefing drafted by AI from the shipments above. Check it against the table.</h2>
        {touched(d) && <p className="mt-1 text-xs text-ink-2">Drafted at {dayTime(DEMO_NOW)}. The table has newer updates.</p>}
        <ul className="mt-2 list-disc space-y-1 pl-4">{briefings[team].map((b) => <li key={b}>{b}</li>)}</ul>
      </section>
    </>
  );
}

export function OpsShipment({ shipment }: { shipment: Shipment }) {
  const d = useDemo();
  const [v] = shipmentViews([shipment], d);
  const pending = pendingEmails(shipment.ref, d);
  const action = nextAction(v, pending[0]);
  const target = actionTarget(v, pending);
  const operator = operatorName(v.last?.source.operatorId ?? shipment.legs[0].operatorId);
  // No drafts while an operator email waits for review: they would be written without its facts.
  const chase = !pending.length && v.exceptions[0]?.action === "contact_operator" && chases[shipment.ref];
  const draftKey = v.events.map((e) => e.source.rawId).findLast((id) => drafts[id]) ?? shipment.ref;
  const draft = !pending.length && drafts[draftKey];
  const to = accountName(shipment.accountId);

  const messages = (
    <section id="messages">
      <h2 className="mb-1 text-base font-semibold">Operator messages</h2>
      <p className="mb-4 text-ink-2">As received, newest first.</p>
      <ul className="space-y-6">
        {played(d)
          .raws.filter((r) => r.shipmentRef === shipment.ref)
          .toReversed()
          .map((r) => (
            <Message
              key={r.id}
              r={r}
              state={d.reviews[r.id] ?? (pending.includes(r) ? "pending" : "applied")}
              onReview={(s) => setDemo({ ...d, reviews: { ...d.reviews, [r.id]: s } })}
            />
          ))}
      </ul>
    </section>
  );
  // An email waiting for review is the first thing to do, so it leads. Ignores reviews so nothing jumps after Approve.
  const reviewFirst = pendingEmails(shipment.ref, { ...d, reviews: {} }).length > 0;

  return (
    <>
      <ShipmentHead v={v} lead={to}>
        <dl className="mt-3">
          <Term>Next action</Term>
          <dd>{!action ? "None" : target ? <a href={`#${target}`} className="py-1 text-accent hover:underline">{action}</a> : action}</dd>
        </dl>
      </ShipmentHead>
      <ShipmentBody v={v} onUpload={(name) => setDemo({ ...d, uploaded: [...d.uploaded, `${shipment.ref}/${name}`] })}>
        {reviewFirst && messages}
        {chase && <Draft id="contact" title={`Message to ${operator}`} key={`chase-${shipment.ref}`} draft={chase} to={operator} />}
        {draft && <Draft id="update" title="Customer update" key={draftKey} draft={draft} to={to} />}
        <section>
          <h2 className="mb-4 text-base font-semibold">Journey</h2>
          <Timeline v={v} />
        </section>
        {!reviewFirst && messages}
      </ShipmentBody>
    </>
  );
}

function Draft({ id, title, draft, to }: { id: string; title: string; draft: { basis: string; text: string }; to: string }) {
  const [reviewed, setReviewed] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <section id={id}>
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <div className="border border-dashed border-line-strong px-4 py-3">
        <p className="text-xs text-ink-2">Drafted by AI from {draft.basis}. Review before sending.</p>
        <textarea
          aria-label={`Message to ${to}`}
          defaultValue={draft.text}
          rows={9}
          readOnly={sent}
          // Drafts are in the recipient's language: the browser's spellchecker would underline every line.
          spellCheck={false}
          // Grows to the whole draft where supported; elsewhere, 9 rows and a scrollbar.
          className="mt-2 w-full border border-line-strong bg-field p-2 field-sizing-content read-only:text-ink-2"
        />
        {sent ? (
          <p role="status" className="mt-2 font-semibold text-ok">Marked as sent to {to}. Nothing is emailed in this prototype.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 py-1">
              <input type="checkbox" className="size-4" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
              I reviewed this draft
            </label>
            <button type="button" disabled={!reviewed} onClick={() => setSent(true)} className={button}>
              Send to {to}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

const OUTCOME: Record<Review, string> = {
  approved: "Approved by you and applied.",
  rejected: "Rejected. Kept as raw, not applied.",
};

const level = (c: number) => (c >= AUTO_APPLY ? "High" : c >= 0.7 ? "Medium" : "Low");

function Message({ r, state, onReview }: { r: RawEvent; state: Review | "pending" | "applied"; onReview: (s: Review) => void }) {
  const x = extractions[r.id];
  const e = r.format === "email" ? null : normalize(r);
  return (
    <li>
      <p className="flex flex-wrap justify-between gap-x-3">
        <span className="font-semibold">{operatorName(r.operatorId)}</span>
        <span className="text-ink-2">{dayTime(r.receivedAt)}</span>
      </p>
      {r.format === "email" ? (
        <div className="mt-1">
          <p>{r.payload.subject}</p>
          <p className="mt-1 max-w-prose text-ink-2">{r.payload.body}</p>
        </div>
      ) : (
        <p className="mt-1">{e ? readAs(e) : <span className="font-semibold text-warn">Not understood. Kept as raw, not applied.</span>}</p>
      )}
      {x && state === "applied" && (
        <p className="mt-1 text-ink-2">Read by AI as: {readAs(x)}. {level(x.confidence)} confidence, applied automatically.</p>
      )}
      {x && state !== "applied" && (
        <div className="mt-2 border border-dashed border-line-strong px-3 py-2">
          <p className="text-xs text-ink-2">Read by AI, {level(x.confidence).toLowerCase()} confidence</p>
          <p className="mt-1">{readAs(x)}</p>
          <p className="mt-1 text-ink-2">Based on: “{x.evidence}”</p>
          {state === "pending" ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="font-semibold text-warn">Not applied until you review it.</span>
              <button type="button" onClick={() => onReview("approved")} className={button}>Approve</button>
              <button type="button" onClick={() => onReview("rejected")} className={button}>Reject</button>
            </div>
          ) : (
            <p role="status" tabIndex={-1} ref={focusOnMount} className="mt-2 text-ink-2">{OUTCOME[state]}</p>
          )}
        </div>
      )}
      <details className="mt-2 text-xs text-ink-2">
        <summary className="cursor-pointer py-1 hover:text-ink">Raw payload ({r.format})</summary>
        <pre className="overflow-x-auto pl-4 font-mono">{JSON.stringify(r.payload, null, 2)}</pre>
      </details>
    </li>
  );
}
