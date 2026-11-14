import type { Metadata } from "next";
import { Suspense } from "react";
import { FieldView, FieldViewSkeleton } from "@/views/field";

export const metadata: Metadata = { title: "My field", robots: { index: false } };

/** Field ids live in the browser (localStorage), so the id is resolved at request time inside Suspense. */
export default function FieldPage({ params }: PageProps<"/field/[id]">) {
  return (
    <Suspense fallback={<FieldViewSkeleton />}>
      <FieldRoute params={params} />
    </Suspense>
  );
}

async function FieldRoute({ params }: { params: PageProps<"/field/[id]">["params"] }) {
  const { id } = await params;
  return <FieldView id={id} />;
}
