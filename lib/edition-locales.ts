import type { Edition } from "@/types/digest";
import type { Language } from "@/components/i18n/language";

const translations: Record<
  string,
  { title: string; intro: string; stories: readonly [string, string][] }
> = {
  "2026-10-11": {
    title: "Geliştiricilerin çalışma biçimini değiştiren araçlar",
    intro:
      "Bugün geliştiricilerin konuştuğu fikir ve yeniliklere hızlıca göz atın.",
    stories: [
      [
        "Yapay zekâ destekli yazılım geliştirmenin yeni yönü",
        "Geliştiriciler, kod incelemesini ve yazılım kalitesini koruyarak yapay zekâyı günlük işlerine katmanın yollarını buluyor.",
      ],
      [
        "Küçük araçlar, özenli mühendislik",
        "Açık kaynakta üretim yapan kişilerin paylaştığı kullanışlı fikirlerden bir seçki.",
      ],
      [
        "Geliştiriciler bu hafta neler öğreniyor?",
        "Topluluk sohbetlerinde öne çıkan beceriler, araçlar ve çalışma alışkanlıkları.",
      ],
    ],
  },
  "2026-10-10": {
    title: "Yazılımda verimli bir gün",
    intro: "Dünden göz atmaya değer haberler ve topluluk sohbetleri.",
    stories: [
      [
        "Yazılım güvenilirliğine yakından bakış",
        "Mühendisler, büyüyen sistemleri anlaşılır ve güvenilir tutmaya dair deneyimlerini paylaştı.",
      ],
      [
        "Günlük geliştirme işlerini kolaylaştırmak",
        "İş akışındaki küçük iyileştirmeler, ekiplerin günlük çalışmalarında fark yaratabiliyor.",
      ],
      [
        "Geliştiricilerin sorduğu sorular",
        "Son sohbetlerde kariyer, öğrenme yolları ve kullanılan araçlar öne çıkıyor.",
      ],
    ],
  },
  "2026-10-09": {
    title: "Geliştiriciler neler konuşuyor?",
    intro: "Teknoloji topluluklarındaki son sohbetlerden üç faydalı okuma.",
    stories: [
      [
        "Özenle yazılım geliştirmek",
        "Yazılımı zaman içinde daha kolay sürdürülebilir kılan kararlar üzerine bir sohbet.",
      ],
      [
        "Açıkça öğrenmek",
        "Geliştiriciler yeni beceriler edinirken topluluğa katkı sunmanın yollarını paylaştı.",
      ],
      [
        "Paylaşmaya değer araçlar ve fikirler",
        "Geliştiriciler arasında dolaşan pratik önerilerden kısa bir seçki.",
      ],
    ],
  },
};

export function getLocalizedEdition(
  edition: Edition,
  language: Language,
): Edition {
  if (language === "en") return edition;
  const translation = translations[edition.slug];
  if (!translation) return edition;
  return {
    ...edition,
    title: translation.title,
    intro: translation.intro,
    stories: edition.stories.map((story, index) => ({
      ...story,
      topic:
        ["YAZILIM VE YAPAY ZEKÂ", "AÇIK KAYNAK", "TOPLULUK"][index] ??
        story.topic,
      title: translation.stories[index]?.[0] ?? story.title,
      summary: translation.stories[index]?.[1] ?? story.summary,
    })),
  };
}
