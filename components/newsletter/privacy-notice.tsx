"use client";
import { useLanguage } from "@/components/i18n/language";
const copy = {
  en: {
    title: "Privacy notice",
    body: "Your email address and selected email language are used to manage newsletter permission and delivery. Signup records include the consent version/time, confirmation expiry, and delivery attempts. Email links allow confirmation, unsubscribe, and language changes. Signup alone does not confirm your subscription.",
    choice:
      "You can unsubscribe using the link in a newsletter. We retain delivery records separately from the current subscription state. Link tokens and message payloads are private; they are not analytics data.",
    launch:
      "Public signup is not open yet. Operator contact details, service-provider disclosures, and the retention policy will be finalized before it opens.",
  },
  tr: {
    title: "Gizlilik bildirimi",
    body: "E-posta adresiniz ve seçtiğiniz e-posta dili, bülten onayını ve gönderimini yönetmek için kullanılır. Kayıtlar onay metninin sürümünü/zamanını, doğrulama süresini ve gönderim denemelerini içerir. E-posta bağlantılarıyla doğrulama, abonelikten çıkma ve dil değişikliği yapılabilir. Kayıt olmak tek başına aboneliği onaylamaz.",
    choice:
      "Bültendeki bağlantıyla abonelikten çıkabilirsiniz. Gönderim kayıtları mevcut abonelik durumundan ayrı tutulur. Bağlantı belirteçleri ve mesaj içerikleri özeldir; analiz verisi olarak kullanılmaz.",
    launch:
      "Herkese açık kayıt henüz açılmadı. Açılmadan önce işletmeci iletişim bilgileri, hizmet sağlayıcı açıklamaları ve saklama politikası tamamlanacak.",
  },
};
export default function PrivacyNotice() {
  const text = copy[useLanguage()];
  return (
    <main id="main" className="mx-auto max-w-2xl space-y-6 px-6 py-16">
      <h1 className="text-3xl font-semibold">{text.title}</h1>
      <p>{text.body}</p>
      <p>{text.choice}</p>
      <p>{text.launch}</p>
    </main>
  );
}
