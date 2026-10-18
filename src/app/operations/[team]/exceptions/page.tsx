import Link from "next/link";
import { notFound } from "next/navigation";
import { briefings, shipments } from "@/data";
import { visible } from "@/domain";
import { accountName, day, Expected, Header, nextAction, opsPersona, opsTeams, pendingEmails, shipmentViews, siteName, StatusBadge, td, th } from "@/ui";

export function generateStaticParams() {
  return opsTeams.map((p) => ({ team: p.id }));
}

export default async function Page({ params }: PageProps<"/operations/[team]/exceptions">) {
  const { team } = await params;
  const persona = opsPersona(team);
  if (!persona) notFound();
  const rows = shipmentViews(visible(persona, shipments))
    .map((v) => ({ v, action: nextAction(v, pendingEmails(v.shipment.ref)[0]) }))
    .toSorted((a, b) => (b.v.exceptions[0]?.severity ?? 0) - (a.v.exceptions[0]?.severity ?? 0));
  const open = rows.filter((r) => r.action).length;

  return (
    <>
      <Header who={persona.name} role="Operations" />
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        <h1 className="text-xl font-semibold">Exceptions</h1>
        <p className="text-ink-2">{open} of {rows.length} shipments need action, most severe first.</p>

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
            {rows.map(({ v, action }) => (
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
                <td className={td}><StatusBadge v={v} /></td>
                <td className={`${td} whitespace-normal!`}>{action ?? <span className="text-ink-2">None</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-8 max-w-prose border border-dashed border-line-strong px-4 py-3">
          <h2 className="text-xs font-semibold text-ink-2">Briefing drafted by AI from the shipments above. Check it against the table.</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4">{briefings[team].map((b) => <li key={b}>{b}</li>)}</ul>
        </section>
      </main>
    </>
  );
}
