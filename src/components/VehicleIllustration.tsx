export function VehicleIllustration() {
  return (
    <svg
      className="vehicle-illustration"
      viewBox="0 0 540 250"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="car-surface"
          x1="280"
          y1="55"
          x2="280"
          y2="218"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#293941" />
          <stop offset="1" stopColor="#131C23" />
        </linearGradient>
        <radialGradient id="car-glow">
          <stop stopColor="#41D9E8" stopOpacity=".14" />
          <stop offset="1" stopColor="#41D9E8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="280" cy="176" rx="245" ry="65" fill="url(#car-glow)" />
      <g stroke="#283640" strokeWidth=".7">
        <path d="m34 186 208-96 260 77-220 77-248-58ZM79 164l250 64M125 143l250 68M175 121l250 72M102 203l221-87M169 219l222-83M235 235l221-84" />
      </g>
      <g stroke="#728E9B" strokeWidth="1.3" strokeLinejoin="round">
        <path
          d="m77 151 30-39 79-22 56-44 115 16 64 58 55 31-3 32-38 16-64-3-170-29-81 9-40-12Z"
          fill="url(#car-surface)"
        />
        <path d="m186 90 56-44 115 16 64 58-130-21-105-9Z" fill="#17262F" />
        <path d="m199 88 47-34 103 14 51 45-110-20-91-5Z" fill="#0C161E" />
        <path d="m246 54 43 39M320 64l32 39M291 99l-5 61 85 16 45-49M186 96l-18 50M180 102l96 10M297 118l18 3M346 126l16 3" />
        <path d="m77 151 90-5 119 14 133 27 57-36M107 112l79-16M421 120l-5 7 60 24M81 159l42 9 40-13M371 176l48 11 51-18" />
        <path
          d="m104 132 48-8-10 14-44 9M431 144l28 11-17 8-18-7"
          stroke="#83EDF2"
          strokeWidth="2"
        />
        <path d="m91 153 45-7M94 157l38-7M425 176l38-12" stroke="#3C535F" />
        <ellipse
          cx="174"
          cy="161"
          rx="23"
          ry="31"
          transform="rotate(-16 174 161)"
          fill="#0C1016"
        />
        <ellipse
          cx="174"
          cy="161"
          rx="13"
          ry="20"
          transform="rotate(-16 174 161)"
          stroke="#536671"
          strokeWidth="3"
        />
        <ellipse
          cx="391"
          cy="191"
          rx="23"
          ry="31"
          transform="rotate(-16 391 191)"
          fill="#0C1016"
        />
        <ellipse
          cx="391"
          cy="191"
          rx="13"
          ry="20"
          transform="rotate(-16 391 191)"
          stroke="#536671"
          strokeWidth="3"
        />
        <path d="m200 170 161 28" stroke="#3B5360" strokeWidth="3" />
      </g>
      <g stroke="#41D9E8">
        <circle cx="128" cy="116" r="5" fill="#13272F" />
        <circle cx="128" cy="116" r="11" opacity=".25" />
        <path d="M128 105V66H75" strokeOpacity=".5" />
      </g>
      <text
        x="35"
        y="57"
        fill="#7B9BA9"
        fontSize="9"
        fontFamily="system-ui"
        letterSpacing="2"
      >
        MOTEUR
      </text>
    </svg>
  );
}
