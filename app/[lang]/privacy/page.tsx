import type { Metadata } from "next";
import PrivacyNotice from "@/components/newsletter/privacy-notice";
import { isLanguage } from "@/lib/localized-routes";
import { pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ lang: string }> };

const copy = {
  tr: {
    title: "Gizlilik bildirimi",
    description:
      "devup bülteninin hangi kişisel verileri, hangi amaçla ve ne kadar süre işlediğine dair aydınlatma metni.",
  },
  en: {
    title: "Privacy notice",
    description:
      "Which personal data the devup newsletter processes, why, and for how long.",
  },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  const language = isLanguage(lang) ? lang : "tr";
  return pageMetadata({ language, path: "/privacy", ...copy[language] });
}

export default function Page() {
  return (
    <PrivacyNotice cleanupEnabled={process.env.CLEANUP_ENABLED === "true"} />
  );
}
