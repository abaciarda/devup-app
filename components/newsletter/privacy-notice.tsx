"use client";

import { useLanguage } from "@/components/i18n/language";

const contactEmail = "ardaabaci19@gmail.com";
const copy = {
  en: {
    title: "Privacy notice",
    updated: "Updated 16 October 2026",
    operator: "Who runs devup",
    operatorBody:
      "devup is a technology newsletter run by Arda Abacı. For questions about your subscription or personal data, contact:",
    data: "What we store and why",
    dataBody:
      "We store your email address, selected newsletter language, subscription status, and consent time and version to manage your subscription. Confirmation tokens have an expiry time. Delivery records include send attempts, provider identifiers, errors, and delivery, bounce, or complaint events. Queued messages contain the recipient address and personal subscription links.",
    protection: "Signup protection and preferences",
    protectionBody:
      "To limit abusive requests, the app keeps rate-limit counters using keyed hashes of email addresses and, when supplied by the host, IP addresses. Hosting providers may also process request logs. Your language preferences are stored in cookies and browser local storage.",
    providers: "Services used",
    providersBody:
      "Vercel hosts the website, Prisma Postgres stores subscription and delivery records, and Resend processes outgoing emails and delivery events. Google Gemini summarizes news sources; subscriber email addresses are not included in the application's news-generation requests. These providers may process information outside Türkiye; their processing locations and retention depend on the service and account settings.",
    choices: "Your subscription and requests",
    choicesBody:
      "Signing up requests a confirmation email. Newsletter delivery starts after you confirm. Each newsletter includes links to unsubscribe and change its language. Unsubscribing stops future newsletter delivery; it does not automatically erase existing delivery records. You can contact Arda to request access, correction, or deletion of your personal data. Requests are reviewed individually; the app does not provide automatic account erasure.",
    retention: "Retention and cleanup",
    retentionEnabled:
      "Automatic cleanup is enabled. Its policy removes eligible unused news-source records older than 14 days, never-attempted pending signups older than 30 days, and expired rate-limit counters after one day. Eligible confirmation tokens and message payloads are cleared seven days after expiry; terminal newsletter message payloads are redacted after 90 days. Cleanup runs in batches, so these thresholds are eligibility periods rather than exact deletion deadlines.",
    retentionDisabled:
      "Automatic cleanup is currently disabled. The app therefore does not promise deletion after a fixed period. Subscription records and delivery history remain stored until reviewed and removed or redacted by the operator. Contact Arda if you would like your data reviewed for deletion.",
    retained:
      "Cleanup does not erase every record: confirmed, unsubscribed, and suppressed addresses, minimal delivery history, and records needing delivery review can remain. Provider logs and backups are managed separately from application cleanup.",
  },
  tr: {
    title: "Gizlilik bildirimi",
    updated: "Son güncelleme: 16 Ekim 2026",
    operator: "devup'ı kim hazırlıyor?",
    operatorBody:
      "devup, Arda Abacı tarafından hazırlanan bir teknoloji bültenidir. Aboneliğiniz veya kişisel verilerinizle ilgili sorularınız için iletişim:",
    data: "Hangi bilgileri, neden saklıyoruz?",
    dataBody:
      "Aboneliğinizi yönetmek için e-posta adresinizi, seçtiğiniz bülten dilini, abonelik durumunuzu ve onay zamanını ve sürümünü saklarız. Doğrulama belirteçlerinin bir geçerlilik süresi vardır. Gönderim kayıtları; gönderim denemelerini, sağlayıcı kimliklerini, hataları ve teslim, geri dönme veya şikâyet olaylarını içerir. Sıraya alınan iletilerde alıcı adresi ve kişisel abonelik bağlantıları bulunur.",
    protection: "Kayıt güvenliği ve tercihler",
    protectionBody:
      "Kötüye kullanımı sınırlandırmak için e-posta adreslerinin ve barındırma hizmeti sağladığında IP adreslerinin anahtarlı özetlerinden oluşturulan istek sayaçları tutulur. Barındırma sağlayıcıları ayrıca istek günlüklerini işleyebilir. Dil tercihleriniz çerezlerde ve tarayıcınızın yerel depolama alanında saklanır.",
    providers: "Kullandığımız hizmetler",
    providersBody:
      "Web sitesi Vercel üzerinde çalışır; abonelik ve gönderim kayıtları Prisma Postgres üzerinde saklanır. E-postaları Resend gönderir ve teslim olaylarını işler. Google Gemini haber kaynaklarını özetler; uygulamanın haber üretim isteklerine abone e-posta adresleri eklenmez. Bu sağlayıcılar bilgileri Türkiye dışında işleyebilir; işleme konumları ve saklama süreleri hizmete ve hesap ayarlarına bağlıdır.",
    choices: "Aboneliğiniz ve veri talepleriniz",
    choicesBody:
      "Kayıt olduğunuzda doğrulama e-postası istenir. Bülten gönderimi, bağlantı üzerinden onay verdikten sonra başlar. Her bültende abonelikten çıkma ve dil değiştirme bağlantıları bulunur. Abonelikten çıkmak sonraki bülten gönderimlerini durdurur; mevcut gönderim kayıtlarını otomatik olarak silmez. Kişisel verilerinize erişim, düzeltme veya silme talebi için Arda ile iletişime geçebilirsiniz. Talepler ayrı ayrı değerlendirilir; uygulamada otomatik hesap silme işlemi bulunmaz.",
    retention: "Saklama ve temizlik",
    retentionEnabled:
      "Otomatik temizlik etkindir. Politika kapsamında uygun durumdaki 14 günden eski kullanılmamış haber kaynakları, 30 günden eski ve gönderim denenmemiş bekleyen kayıtlar ve süresi dolduktan sonra bir gün geçmiş istek sayaçları kaldırılır. Uygun doğrulama belirteçleri ve ileti içerikleri, doğrulama süresi dolduktan yedi gün sonra temizlenir; işlemi tamamlanmış bültenlerin ileti içerikleri 90 gün sonra karartılır. Temizlik gruplar hâlinde çalışır; bu süreler kesin silinme tarihleri değil, temizliğe uygunluk eşikleridir.",
    retentionDisabled:
      "Otomatik temizlik şu anda kapalıdır. Bu nedenle uygulama, belirli bir süre sonunda silinme taahhüdü vermez. Abonelik ve gönderim geçmişi, işletmeci tarafından incelenip silinene veya içerikleri karartılana kadar saklanır. Verilerinizin silinmek üzere değerlendirilmesi için Arda ile iletişime geçebilirsiniz.",
    retained:
      "Temizlik bütün kayıtları silmez: onaylı, abonelikten çıkmış veya gönderimi engellenmiş adresler, sınırlı gönderim geçmişi ve gönderim incelemesi gerektiren kayıtlar saklanabilir. Sağlayıcı günlükleri ve yedekler, uygulamanın temizliğinden ayrı yönetilir.",
  },
};

export default function PrivacyNotice({
  cleanupEnabled,
}: {
  cleanupEnabled: boolean;
}) {
  const text = copy[useLanguage()];
  const sections = [
    { title: text.data, body: text.dataBody },
    { title: text.protection, body: text.protectionBody },
    { title: text.providers, body: text.providersBody },
    { title: text.choices, body: text.choicesBody },
    {
      title: text.retention,
      body: cleanupEnabled ? text.retentionEnabled : text.retentionDisabled,
    },
  ];

  return (
    <main id="main" className="mx-auto max-w-2xl space-y-8 px-6 py-16">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold">{text.title}</h1>
        <p className="text-sm text-muted">{text.updated}</p>
      </header>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{text.operator}</h2>
        <p className="leading-7">{text.operatorBody}</p>
        <a
          href={`mailto:${contactEmail}`}
          className="underline underline-offset-4"
        >
          {contactEmail}
        </a>
      </section>
      {sections.map((section) => (
        <section key={section.title} className="space-y-3">
          <h2 className="text-xl font-semibold">{section.title}</h2>
          <p className="leading-7">{section.body}</p>
        </section>
      ))}
      <p className="leading-7">{text.retained}</p>
    </main>
  );
}
