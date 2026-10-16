import PrivacyNotice from "@/components/newsletter/privacy-notice";
export const metadata = { title: "Privacy notice" };
export default function Page() {
  return (
    <PrivacyNotice cleanupEnabled={process.env.CLEANUP_ENABLED === "true"} />
  );
}
