import Link from "next/link";
import { notFound } from "next/navigation";
import { shipments } from "@/data";
import { visible } from "@/domain";
import { CustomerShipment, Header } from "@/live";
import { customerPersona, customers } from "@/ui";

export function generateStaticParams() {
  return customers.flatMap((p) => visible(p, shipments).map((s) => ({ account: p.accountIds![0], ref: s.ref })));
}

export async function generateMetadata({ params }: PageProps<"/customer/[account]/shipments/[ref]">) {
  return { title: (await params).ref };
}

export default async function Page({ params }: PageProps<"/customer/[account]/shipments/[ref]">) {
  const { account, ref } = await params;
  const persona = customerPersona(account);
  const shipment = persona && visible(persona, shipments).find((s) => s.ref === ref);
  if (!persona || !shipment) notFound();

  return (
    <>
      <Header who={persona.name} role="Customer portal" />
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6">
        <Link href={`/customer/${account}/shipments`} className="py-1 text-accent hover:underline">Your shipments</Link>
        <CustomerShipment shipment={shipment} />
      </main>
    </>
  );
}
