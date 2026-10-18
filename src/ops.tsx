"use client";
// Ops actions on one shipment. State is local to the page for now.
import { useState } from "react";
import { normalize, type RawEvent } from "./adapters";
import { drafts, extractions, rawEvents } from "./data";
import type { Shipment } from "./domain";
import {
  accountName, dayTime, nextAction, operatorName, pendingEmails, readAs, ShipmentBody, ShipmentHead, shipmentViews, Term, Timeline,
} from "./ui";

type Review = "approved" | "rejected";

const level = (c: number) => (c >= 0.9 ? "High" : c >= 0.7 ? "Medium" : "Low");

export function OpsShipment({ shipment: base }: { shipment: Shipment }) {
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [uploaded, setUploaded] = useState<string[]>([]);

  const shipment = { ...base, documents: base.documents.map((d) => (uploaded.includes(d.name) ? { ...d, status: "available" as const } : d)) };
  const approved = Object.keys(reviews).filter((id) => reviews[id] === "approved");
  const [v] = shipmentViews([shipment], approved);
  const pending = pendingEmails(shipment.ref, approved).filter((r) => !reviews[r.id]);
  const action = nextAction(v, pending[0]);
  const top = v.exceptions[0]?.action;
  const target = pending.length ? "messages" : top === "upload_document" ? "documents" : top === "notify_customer" ? "update" : undefined;
  const draftKey = approved.findLast((id) => drafts[id]) ?? shipment.ref;
  const draft = drafts[draftKey];
  const to = accountName(shipment.accountId);

  const messages = (
    <section id="messages">
      <h2 className="mb-1 font-semibold">Operator messages</h2>
      <p className="mb-4 text-ink-2">As received, newest first.</p>
      <ul className="space-y-6">
        {rawEvents
          .filter((r) => r.shipmentRef === shipment.ref)
          .toReversed()
          .map((r) => (
            <Message
              key={r.id}
              r={r}
              state={reviews[r.id] ?? (pending.includes(r) ? "pending" : "applied")}
              onReview={(s) => setReviews({ ...reviews, [r.id]: s })}
            />
          ))}
      </ul>
    </section>
  );
  // An email waiting for review is the first thing to do, so it leads. Fixed on load so nothing jumps after Approve.
  const reviewFirst = pendingEmails(base.ref).length > 0;

  return (
    <>
      <ShipmentHead v={v} lead={to}>
        <dl className="mt-3">
          <Term>Next action</Term>
          <dd>{!action ? "None" : target ? <a href={`#${target}`} className="text-accent hover:underline">{action}</a> : action}</dd>
        </dl>
      </ShipmentHead>
      <ShipmentBody v={v} onUpload={(name) => setUploaded([...uploaded, name])}>
        {reviewFirst && messages}
        {draft && <Draft key={draftKey} draft={draft} to={to} />}
        <section>
          <h2 className="mb-4 font-semibold">Journey</h2>
          <Timeline v={v} />
        </section>
        {!reviewFirst && messages}
      </ShipmentBody>
    </>
  );
}

const button =
  "border border-line-strong px-3 py-1 font-semibold hover:border-ink active:border-ink-2 disabled:cursor-not-allowed disabled:border-line disabled:text-ink-2";

function Draft({ draft, to }: { draft: { basis: string; text: string }; to: string }) {
  const [reviewed, setReviewed] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <section id="update">
      <h2 className="mb-3 font-semibold">Customer update</h2>
      <div className="border border-dashed border-line-strong px-4 py-3">
        <p className="text-xs text-ink-2">Drafted by AI from {draft.basis}. Review before sending.</p>
        <textarea
          aria-label={`Message to ${to}`}
          defaultValue={draft.text}
          rows={9}
          readOnly={sent}
          className="mt-2 w-full border border-line-strong bg-white p-2 read-only:text-ink-2"
        />
        {sent ? (
          <p role="status" className="mt-2 font-semibold text-ok">Marked as sent to {to}. Nothing is emailed in this prototype.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 py-1">
              <input type="checkbox" className="size-[15px]" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
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

// Stable ref callback: runs once on mount, taking focus from the Approve/Reject button that just disappeared.
const focusOnMount = (el: HTMLElement | null) => el?.focus();

const OUTCOME: Record<Review, string> = {
  approved: "Approved by you and applied.",
  rejected: "Rejected. Kept as raw, not applied.",
};

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
        <summary className="cursor-pointer py-1">Raw payload ({r.format})</summary>
        <pre className="overflow-x-auto pl-4 font-mono">{JSON.stringify(r.payload, null, 2)}</pre>
      </details>
    </li>
  );
}
