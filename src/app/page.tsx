import Link from "next/link";
import { personas } from "@/data";
import { DEMO_NOW, type Persona } from "@/domain";
import { dayTime, perimeter, td, th } from "@/ui";

const href = (p: Persona) =>
  p.role === "customer" ? `/customer/${p.accountIds![0]}/shipments` : `/operations/${p.id}/exceptions`;

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 md:px-6">
      <h1 className="text-xl font-semibold">Shipment Tracking</h1>
      <p className="mt-1 text-ink-2">
        Prototype with synthetic data. The demo clock is fixed at {dayTime(DEMO_NOW)} UTC. Pick who you are.
      </p>
      <table className="mt-8 w-full">
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
                <Link href={href(p)} className="text-accent hover:underline">{p.name}</Link>
              </td>
              <td className={td}>{p.role === "customer" ? "Customer" : "Operations"}</td>
              <td className={`${td} hidden text-ink-2 sm:table-cell`}>{perimeter(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
