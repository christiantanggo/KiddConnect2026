'use client';

export default function KidQuizLayout({ children }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Playful header banner */}
      <div
        className="flex items-center gap-3 rounded-xl px-5 py-3"
        style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)' }}
      >
        <span className="text-2xl">🎯</span>
        <div>
          <h2 className="text-lg font-bold text-white leading-tight">Kid Quiz Studio</h2>
          <p className="text-xs text-purple-100">Build quiz Shorts · Render · Upload to YouTube</p>
        </div>
      </div>
      {children}
    </div>
  );
}
