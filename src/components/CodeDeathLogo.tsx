import React, { FC } from 'react';

interface CodeDeathLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  subtitle?: string;
}

export const CodeDeathLogo: FC<CodeDeathLogoProps> = ({
  size = 'md',
  showText = true,
  className = '',
  subtitle,
}) => {
  const sizeMap = {
    sm: { box: 'w-6 h-6', iconSize: 24, text: 'text-sm', subText: 'text-[9px]' },
    md: { box: 'w-8 h-8', iconSize: 32, text: 'text-base', subText: 'text-[10px]' },
    lg: { box: 'w-11 h-11', iconSize: 44, text: 'text-xl', subText: 'text-xs' },
    xl: { box: 'w-16 h-16', iconSize: 64, text: 'text-3xl', subText: 'text-sm' },
  };

  const { box, text, subText } = sizeMap[size];

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {/* CODE DEATH Technical Geometric Mark */}
      <div
        className={`relative ${box} rounded-xl bg-slate-950 border border-slate-800/90 flex items-center justify-center shadow-lg shadow-black/50 group overflow-hidden transition-all duration-300 hover:border-slate-700`}
      >
        {/* Subtle cyber background grid / ambient aura */}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-rose-500/10 pointer-events-none" />
        
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full p-1 drop-shadow-[0_0_8px_rgba(0,242,254,0.3)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer tech bracket left (Cyan) */}
          <path
            d="M26 30L12 50L26 70"
            stroke="#00f2fe"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Outer tech bracket right (Crimson / Magenta) */}
          <path
            d="M74 30L88 50L74 70"
            stroke="#ff0055"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Center Stylized Developer Skull / Core Face */}
          {/* Forehead / Cranium */}
          <path
            d="M34 38C34 26 66 26 66 38C66 48 62 52 60 58H40C38 52 34 48 34 38Z"
            fill="#0f172a"
            stroke="#e2e8f0"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          {/* Eyes / Terminal apertures */}
          <rect x="40" y="38" width="6" height="7" rx="2" fill="#00f2fe" />
          <rect x="54" y="38" width="6" height="7" rx="2" fill="#ff0055" />
          {/* Nose aperture */}
          <polygon points="50,47 48,51 52,51" fill="#94a3b8" />
          {/* Teeth / Code Barcode Matrix */}
          <rect x="42" y="61" width="3" height="7" rx="1" fill="#e2e8f0" />
          <rect x="48.5" y="61" width="3" height="7" rx="1" fill="#e2e8f0" />
          <rect x="55" y="61" width="3" height="7" rx="1" fill="#e2e8f0" />
          {/* Jaw outline */}
          <path
            d="M38 58V69C38 71 41 73 45 73H55C59 73 62 71 62 69V58"
            stroke="#e2e8f0"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Brand Typography */}
      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span
              className={`font-black tracking-wider text-white uppercase ${text}`}
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              CODE <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-rose-400">DEATH</span>
            </span>
            <span className="inline-block px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 text-[9px] font-mono font-bold text-rose-400 tracking-tight">
              PRO
            </span>
          </div>
          {subtitle && (
            <span className={`text-slate-400 font-medium tracking-wide uppercase ${subText}`}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
