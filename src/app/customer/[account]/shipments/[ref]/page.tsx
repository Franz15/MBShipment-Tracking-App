import Link from "next/link";
import { notFound } from "next/navigation";
import { shipments } from "@/data";
import { visible } from "@/domain";
import { customerAlert, customerPersona, customers, Documents, Eta, Header, shipmentViews, siteName, stateSentence, StatusBadge, Timeline } from "@/ui";

export function generateStaticParams() {
  return customers.flatMap((p) => visible(p, shipments).map((s) => ({ account: p.accountIds![0], ref: s.ref })));
}

export default async function Page({ params }: PageProps<"/customer/[account]/shipments/[ref]">) {
  const { account, ref } = await params;
  const persona = customerPersona(account);
  const shipment = persona && visible(persona, shipments).find((s) => s.ref === ref);
  if (!persona || !shipment) notFound();
  const [v] = shipmentViews([shipment]);
  const alert = customerAlert(v);

  return (
    <>
      <Header who={persona.name} role="Customer portal" />
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6">
        <Link href={`/customer/${account}/shipments`} className="text-accent hover:underline">Your shipments</Link>

        <div className="mt-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-xl font-semibold">{stateSentence(v)}</h1>
            <StatusBadge v={v} />
          </div>
          <p className="mt-1 text-ink-2">
            <span className="mr-2 font-mono text-ink">{v.shipment.ref}</span>
            {siteName(v.shipment.originSiteId)} → {v.shipment.destination}
          </p>
          {alert && <p className="mt-3 max-w-prose">{alert}</p>}
        </div>

        <div className="mt-8 grid gap-10 md:grid-cols-[1fr_18rem]">
          <section>
            <h2 className="mb-4 font-semibold">Journey</h2>
            <Timeline v={v} />
          </section>
          <div className="space-y-8">
            <section>
              <h2 className="mb-3 font-semibold">Arrival</h2>
              <Eta v={v} />
            </section>
            <section>
              <h2 className="mb-3 font-semibold">Documents</h2>
              <Documents v={v} />
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
