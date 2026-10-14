"use client";

export default function StoryArt({
  index,
  label,
}: {
  index: number;
  label: string;
}) {
  const variants = [
    { background: "bg-[#e5edf4]", mark: "✳" },
    { background: "bg-[#f0efec]", mark: "⌘" },
    { background: "bg-[#e8ece8]", mark: "↗" },
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
          {label}
        </span>
      </div>
    </div>
  );
}
