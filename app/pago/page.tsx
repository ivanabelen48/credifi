"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CircleDollarSign, ShieldCheck } from "lucide-react";

function PaymentReference() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("ref") ?? "";
  const amountParam = searchParams.get("monto");
  const amountValue = amountParam === null ? Number.NaN : Number(amountParam);
  const amount = Number.isFinite(amountValue)
    ? `$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(amountValue)}`
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-10">
      <section className="w-full max-w-lg rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-card sm:p-10">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal/10 text-teal">
          <CircleDollarSign size={28} />
        </div>
        <p className="text-sm font-bold tracking-wide text-teal">CREDIFI · REFERENCIA DE COBRO</p>
        <h1 className="mt-3 text-2xl font-bold text-ink">Detalle de pago</h1>
        {amount && <p className="mt-5 text-4xl font-bold text-ink">{amount}</p>}
        {reference && <p className="mt-3 text-sm text-muted">Referencia: {reference}</p>}
        <div className="mt-7 rounded-2xl bg-slate-50 p-4 text-left text-sm leading-6 text-slate-600">
          <p className="flex items-start gap-2 font-semibold text-ink">
            <ShieldCheck className="mt-0.5 shrink-0 text-teal" size={18} />
            Esta página solo comparte los datos de referencia.
          </p>
          <p className="mt-2">
            No procesa pagos ni solicita datos bancarios. Confirma los datos de transferencia directamente con quien administra este crédito.
          </p>
        </div>
        <Link href="/" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-ink hover:text-teal">
          <ArrowLeft size={16} /> Volver a Credifi
        </Link>
      </section>
    </main>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-canvas" />}>
      <PaymentReference />
    </Suspense>
  );
}
