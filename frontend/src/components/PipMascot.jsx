import React from "react";

export function PipMascot({ size = 80, mood = "happy", className = "" }) {
  const getEyebrows = () => {
    switch (mood) {
      case "thinking":
        return (
          <>
            <path d="M 36 32 Q 42 28 48 33" stroke="#7c2d12" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M 64 34 Q 70 36 76 33" stroke="#7c2d12" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </>
        );
      case "encouraging":
      case "calm":
        return (
          <>
            <path d="M 36 33 Q 42 30 48 32" stroke="#7c2d12" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M 64 32 Q 70 30 76 33" stroke="#7c2d12" strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        );
      default: // happy
        return (
          <>
            <path d="M 36 31 Q 42 27 48 31" stroke="#7c2d12" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M 64 31 Q 70 27 76 31" stroke="#7c2d12" strokeWidth="2" fill="none" strokeLinecap="round" />
          </>
        );
    }
  };

  const getMouth = () => {
    switch (mood) {
      case "thinking":
        return <circle cx="56" cy="67" r="3.5" fill="#7c2d12" />;
      case "calm":
        return <path d="M 47 65 Q 56 68 65 65" stroke="#7c2d12" strokeWidth="2.5" fill="none" strokeLinecap="round" />;
      case "encouraging":
      case "happy":
      default:
        return (
          <path d="M 44 63 Q 56 75 68 63" stroke="#7c2d12" strokeWidth="3" fill="#fb7185" strokeLinecap="round" />
        );
    }
  };

  return (
    <div
      className={`inline-flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 112 112"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="transition-transform duration-300 hover:scale-105"
      >
        {/* Tail */}
        <path
          d="M 82 82 C 102 75 110 50 96 35 C 85 45 80 65 72 75 Z"
          fill="#ea580c"
        />
        <path
          d="M 96 35 C 99 43 95 48 90 52 C 86 46 88 40 96 35 Z"
          fill="#fef3c7"
        />

        {/* Ears */}
        <polygon points="28,45 14,14 46,28" fill="#ea580c" />
        <polygon points="28,41 21,21 41,29" fill="#fed7aa" />

        <polygon points="84,45 98,14 66,28" fill="#ea580c" />
        <polygon points="84,41 91,21 71,29" fill="#fed7aa" />

        {/* Head */}
        <ellipse cx="56" cy="56" rx="38" ry="32" fill="#f97316" />

        {/* White cheeks */}
        <path
          d="M 22 58 C 22 75 38 84 56 84 C 74 84 90 75 90 58 C 84 62 72 65 56 65 C 40 65 28 62 22 58 Z"
          fill="#fffbeb"
        />

        {/* Eyebrows */}
        {getEyebrows()}

        {/* Eyes */}
        <ellipse cx="42" cy="45" rx="5" ry="6" fill="#1e293b" />
        <circle cx="40" cy="43" r="2" fill="#ffffff" />

        <ellipse cx="70" cy="45" rx="5" ry="6" fill="#1e293b" />
        <circle cx="68" cy="43" r="2" fill="#ffffff" />

        {/* Rosy blush */}
        <circle cx="32" cy="56" r="6" fill="#f43f5e" opacity="0.3" />
        <circle cx="80" cy="56" r="6" fill="#f43f5e" opacity="0.3" />

        {/* Cute Fox Nose */}
        <polygon points="56,58 51,52 61,52" fill="#7c2d12" />

        {/* Mouth */}
        {getMouth()}
      </svg>
    </div>
  );
}
