import { Suspense } from "react";
import SubscriptionActionView from "@/components/newsletter/subscription-action";
export const metadata = {
  title: "Subscription result",
  robots: { index: false, follow: false },
};
async function Result({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  const { state } = await searchParams;
  return (
    <SubscriptionActionView
      valid={false}
      result={typeof state === "string" ? state : "invalid"}
    />
  );
}
export default function Page(props: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Result {...props} />
    </Suspense>
  );
}
