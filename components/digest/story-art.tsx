"use client";

export default function StoryArt({ index }: { index: number }) {
  const variants = [
    { background: "bg-[#e5edf4]", mark: "✳", label: "AI / SOFTWARE" },
    { background: "bg-[#f0efec]", mark: "⌘", label: "DEVELOPER TOOLS" },
    { background: "bg-[#e8ece8]", mark: "↗", label: "COMMUNITY" },
  ];
  const art = variants[index % variants.length];

  return (
    <div
      className={`flex h-[210px] items-center justify-center ${art.background}`}
      aria-hidden="true"
    >
      <div className="flex size-36 flex-col items-center justify-center rounded-[28px] border border-black/10 bg-white/70">
        <span className="text-[64px] leading-none text-blue">{art.mark}</span>
        <span className="mt-3 text-[9px] font-semibold tracking-[1.2px] text-muted">
          {art.label}
        </span>
      </div>
    </div>
  );
}
