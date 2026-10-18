import Link from "next/link";
import { personas } from "@/data";
import { DEMO_NOW } from "@/domain";
import { ThemeToggle } from "@/live";
import { dayTime, perimeter, personaHref, td, th } from "@/ui";

// A guided path for a first visit: one stop per role and per AI feature.
const TOUR = [
  ["/customer/uk-distributor/shipments", "Northbridge Distribution, customer", "three UK shipments, one held at customs and one that may arrive late. Ask the questions under the table; AI answers from the same data."],
  ["/customer/uk-distributor/shipments/SHP-2003", "SHP-2003", "the arrival section keeps the carrier estimate apart from the range calculated by AI. The map draws only what tracking events confirmed."],
  ["/operations/key-accounts/exceptions", "Key accounts desk, operations", "shipments that need action come first, with an AI briefing. In SHP-2001, upload the missing certificate, then review the AI draft to the customs broker."],
  ["/operations/valencia-site/shipments/SHP-5002", "SHP-5002, Valencia warehouse team", "an operator email read by AI with medium confidence. Nothing changes until you approve the reading."],
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 md:px-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">Shipment Tracking</h1>
        <ThemeToggle />
      </div>
      <p className="mt-1 text-ink-2">
        Prototype with synthetic data. The demo clock starts at {dayTime(DEMO_NOW)} UTC.
      </p>

      <h2 className="mt-8 text-base font-semibold">Choose a persona</h2>
      <table className="mt-3 w-full">
        <thead className="bg-sunken">
          <tr>
            <th className={th}>Persona</th>
            <th className={th}>Portal</th>
            <th className={`${th} hidden sm:table-cell`}>Sees</th>
          </tr>
        </thead>
        <tbody>
          {personas.map((p) => (
            <tr key={p.id} className="border-b border-line">
              <td className={td}>
                <Link href={personaHref(p)} className="text-accent hover:underline">{p.name}</Link>
              </td>
              <td className={td}>{p.role === "customer" ? "Customer" : "Operations"}</td>
              <td className={`${td} hidden text-ink-2 sm:table-cell`}>{perimeter(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <details className="mt-8 max-w-prose">
        <summary className="cursor-pointer py-1 text-ink-2 hover:text-ink">Suggested walkthrough, about 5 minutes</summary>
        <ol className="mt-2 list-decimal space-y-2 pl-4">
          {TOUR.map(([href, label, text]) => (
            <li key={label}>
              <Link href={href} className="text-accent hover:underline">{label}</Link>: {text}
            </li>
          ))}
          <li>Run demo in the header plays four operator updates. Keep a customer page open in a second window: both portals react.</li>
        </ol>
      </details>
    </main>
  );
}
