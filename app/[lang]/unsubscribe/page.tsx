import SubscriptionEntry from "@/components/newsletter/subscription-entry";
export const metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};
export const instant = false;
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  return <SubscriptionEntry action="unsubscribe" searchParams={searchParams} />;
}
