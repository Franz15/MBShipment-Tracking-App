import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { shipments } from "@/data";
import { visible } from "@/domain";
import { customerAlert, customerPersona, customers, day, Expected, Header, shipmentViews, StatusBadge, td, th } from "@/ui";

export function generateStaticParams() {
  return customers.map((p) => ({ account: p.accountIds![0] }));
}

export default async function Page({ params }: PageProps<"/customer/[account]/shipments">) {
  const { account } = await params;
  const persona = customerPersona(account);
  if (!persona) notFound();
  const rows = shipmentViews(visible(persona, shipments))
    .map((v) => ({ v, alert: customerAlert(v) }))
    .toSorted((a, b) => +!a.alert - +!b.alert);
  const flagged = rows.filter((r) => r.alert).length;

  return (
    <>
      <Header who={persona.name} role="Customer portal" />
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        <h1 className="text-xl font-semibold">Your shipments</h1>
        <p className="text-ink-2">
          {flagged === 0
            ? `All ${rows.length} shipments on track.`
            : `${flagged} of ${rows.length} shipments ${flagged === 1 ? "needs" : "need"} attention.`}
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
            {rows.map(({ v, alert }) => (
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
                  <td className={td}><StatusBadge v={v} /></td>
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
      </main>
    </>
  );
}
