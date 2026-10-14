import SubscriptionEntry from "@/components/newsletter/subscription-entry";
export const metadata = {
  title: "Confirm subscription",
  robots: { index: false, follow: false },
};
export const instant = false;
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  return <SubscriptionEntry action="confirm" searchParams={searchParams} />;
}
