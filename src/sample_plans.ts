/**
 * High-fidelity architectural floor plan blueprint vectors encoded as inline Data URIs
 * so that users can instantly try out the application even if they do not have a floor plan file on hand!
 */

export const SAMPLE_FLOOR_PLANS = [
  {
    id: "villa",
    name: "Modern_Villa_Ground_Plan.jpg",
    // Beautiful architectural blueprint floor plan styled as an inline SVG Data URI
    url: "data:image/svg+xml;utf8," + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
        <!-- Blueprint style grid background -->
        <rect width="1200" height="900" fill="#0f172a"/>
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" stroke-width="1"/>
          </pattern>
          <pattern id="major-grid" width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 200 0 L 0 0 0 200" fill="none" stroke="#334155" stroke-width="1.5"/>
          </pattern>
        </defs>
        <rect width="1200" height="900" fill="url(#grid)"/>
        <rect width="1200" height="900" fill="url(#major-grid)"/>

        <!-- Outer Boundary Walls -->
        <rect x="80" y="100" width="1040" height="700" fill="none" stroke="#64748b" stroke-width="16" stroke-linejoin="round"/>
        <rect x="80" y="100" width="1040" height="700" fill="none" stroke="#94a3b8" stroke-width="6" stroke-linejoin="round"/>

        <!-- Room Dividers / Interior Walls -->
        <!-- Living Room - Kitchen Divider -->
        <line x1="460" y1="100" x2="460" y2="480" stroke="#94a3b8" stroke-width="8"/>
        <!-- Kitchen Bottom Divider -->
        <line x1="460" y1="480" x2="1120" y2="480" stroke="#94a3b8" stroke-width="8"/>
        <!-- Master Bedroom Divider -->
        <line x1="460" y1="480" x2="460" y2="800" stroke="#94a3b8" stroke-width="8"/>
        <!-- Bath Divider -->
        <line x1="80" y1="520" x2="460" y2="520" stroke="#94a3b8" stroke-width="8"/>

        <!-- Doors and Swings -->
        <!-- Main Entry Door -->
        <path d="M 80 300 A 80 80 0 0 1 160 380" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="4,4"/>
        <line x1="80" y1="380" x2="160" y2="380" stroke="#38bdf8" stroke-width="3"/>
        <line x1="80" y1="300" x2="80" y2="380" stroke="#f43f5e" stroke-width="6"/> <!-- Door Opening -->

        <!-- Bedroom Door -->
        <path d="M 460 620 A 70 70 0 0 0 530 690" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="3,3"/>
        <line x1="460" y1="690" x2="530" y2="690" stroke="#38bdf8" stroke-width="3"/>

        <!-- Windows -->
        <rect x="200" y="92" width="160" height="16" fill="#38bdf8" opacity="0.6" stroke="#475569" stroke-width="2"/>
        <rect x="750" y="92" width="160" height="16" fill="#38bdf8" opacity="0.6" stroke="#475569" stroke-width="2"/>
        <rect x="1112" y="250" width="16" height="140" fill="#38bdf8" opacity="0.6" stroke="#475569" stroke-width="2"/>
        <rect x="600" y="792" width="180" height="16" fill="#38bdf8" opacity="0.6" stroke="#475569" stroke-width="2"/>

        <!-- Furniture Outline / Layout details (adds premium design vibe) -->
        <!-- Sofa Section in Living -->
        <rect x="120" y="160" width="80" height="240" rx="10" fill="none" stroke="#475569" stroke-width="2" stroke-dasharray="2,2"/>
        <rect x="220" y="160" width="140" height="60" rx="10" fill="none" stroke="#475569" stroke-width="2" stroke-dasharray="2,2"/>
        <!-- Rug -->
        <rect x="220" y="240" width="150" height="130" rx="4" fill="none" stroke="#334155" stroke-width="1.5"/>
        <text x="295" y="310" fill="#334155" font-family="monospace" font-size="12" text-anchor="middle">RUG</text>

        <!-- Kitchen Counter/Sink/Stove -->
        <rect x="940" y="120" width="160" height="340" fill="none" stroke="#475569" stroke-width="2"/>
        <circle cx="1020" cy="220" r="25" fill="none" stroke="#475569" stroke-width="2"/>
        <text x="1020" y="300" fill="#475569" font-family="sans-serif" font-size="10" text-anchor="middle">STOVE</text>

        <!-- Dining Table -->
        <rect x="620" y="240" width="180" height="100" rx="8" fill="none" stroke="#475569" stroke-width="2"/>
        <circle cx="600" cy="290" r="12" fill="none" stroke="#475569" stroke-width="2"/>
        <circle cx="820" cy="290" r="12" fill="none" stroke="#475569" stroke-width="2"/>
        <circle cx="660" cy="215" r="12" fill="none" stroke="#475569" stroke-width="2"/>
        <circle cx="760" cy="215" r="12" fill="none" stroke="#475569" stroke-width="2"/>
        <circle cx="660" cy="365" r="12" fill="none" stroke="#475569" stroke-width="2"/>
        <circle cx="760" cy="365" r="12" fill="none" stroke="#475569" stroke-width="2"/>

        <!-- Master Bed -->
        <rect x="580" y="560" width="200" height="220" rx="8" fill="none" stroke="#475569" stroke-width="2"/>
        <rect x="600" y="570" width="70" height="40" rx="4" fill="none" stroke="#475569" stroke-width="1.5"/>
        <rect x="690" y="570" width="70" height="40" rx="4" fill="none" stroke="#475569" stroke-width="1.5"/>

        <!-- Room Labels and Architectural Typography -->
        <!-- Living Room -->
        <g transform="translate(260, 200)">
          <text fill="#e2e8f0" font-family="sans-serif" font-size="20" font-weight="900" letter-spacing="2" text-anchor="middle">LIVING ROOM</text>
          <text fill="#64748b" font-family="sans-serif" font-size="12" font-weight="bold" y="25" text-anchor="middle">8.5m x 9.5m</text>
        </g>

        <!-- Kitchen / Dining -->
        <g transform="translate(790, 200)">
          <text fill="#e2e8f0" font-family="sans-serif" font-size="20" font-weight="900" letter-spacing="2" text-anchor="middle">KITCHEN &amp; DINING</text>
          <text fill="#64748b" font-family="sans-serif" font-size="12" font-weight="bold" y="25" text-anchor="middle">16.5m x 9.5m</text>
        </g>

        <!-- Master Bed -->
        <g transform="translate(790, 680)">
          <text fill="#e2e8f0" font-family="sans-serif" font-size="20" font-weight="900" letter-spacing="2" text-anchor="middle">MASTER BEDROOM</text>
          <text fill="#64748b" font-family="sans-serif" font-size="12" font-weight="bold" y="25" text-anchor="middle">16.5m x 8.0m</text>
        </g>

        <!-- Bath Room -->
        <g transform="translate(260, 660)">
          <text fill="#e2e8f0" font-family="sans-serif" font-size="18" font-weight="900" letter-spacing="1.5" text-anchor="middle">MASTER BATH</text>
          <text fill="#64748b" font-family="sans-serif" font-size="12" font-weight="bold" y="22" text-anchor="middle">9.5m x 7.0m</text>
        </g>

        <!-- Calibration Scale Reference -->
        <g transform="translate(100, 150)">
          <circle cx="0" cy="0" r="4" fill="#f59e0b"/>
          <circle cx="350" cy="0" r="4" fill="#f59e0b"/>
          <line x1="0" y1="0" x2="350" y2="0" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4,4"/>
          <rect x="130" y="-12" width="90" height="20" rx="4" fill="#1e293b" stroke="#f59e0b" stroke-width="1"/>
          <text x="175" y="2" fill="#f59e0b" font-family="monospace" font-size="10" font-weight="bold" text-anchor="middle">CALIBRATION L: 8.5m</text>
        </g>

        <!-- Title block / Blueprint Stamp (bottom right) -->
        <g transform="translate(850, 640)">
          <rect x="-10" y="30" width="240" height="110" fill="#1e293b" stroke="#475569" stroke-width="2" rx="6"/>
          <text x="110" y="55" fill="#f8fafc" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">ESTATE DEVELOPERS LTD</text>
          <line x1="0" y1="65" x2="220" y2="65" stroke="#475569" stroke-width="1"/>
          <text x="110" y="80" fill="#38bdf8" font-family="sans-serif" font-size="14" font-weight="900" text-anchor="middle">MODERN VILLA PLAN</text>
          <text x="110" y="100" fill="#94a3b8" font-family="monospace" font-size="10" text-anchor="middle">SCALE: 1:100 | GR. FLOOR</text>
          <text x="110" y="120" fill="#94a3b8" font-family="monospace" font-size="9" text-anchor="middle">DATE: JULY 2026 | REV. B</text>
        </g>

        <!-- Graphic scale legend (bottom left) -->
        <g transform="translate(100, 750)">
          <line x1="0" y1="0" x2="200" y2="0" stroke="#94a3b8" stroke-width="3"/>
          <line x1="0" y1="-5" x2="0" y2="5" stroke="#94a3b8" stroke-width="2"/>
          <line x1="50" y1="-3" x2="50" y2="3" stroke="#94a3b8" stroke-width="1.5"/>
          <line x1="100" y1="-5" x2="100" y2="5" stroke="#94a3b8" stroke-width="2"/>
          <line x1="150" y1="-3" x2="150" y2="3" stroke="#94a3b8" stroke-width="1.5"/>
          <line x1="200" y1="-5" x2="200" y2="5" stroke="#94a3b8" stroke-width="2"/>
          <text x="0" y="-10" fill="#94a3b8" font-family="monospace" font-size="9" text-anchor="middle">0m</text>
          <text x="100" y="-10" fill="#94a3b8" font-family="monospace" font-size="9" text-anchor="middle">2.5m</text>
          <text x="200" y="-10" fill="#94a3b8" font-family="monospace" font-size="9" text-anchor="middle">5.0m</text>
          <text x="100" y="18" fill="#64748b" font-family="sans-serif" font-size="10" font-weight="bold" text-anchor="middle">GRAPHICAL BLUEPRINT SCALE</text>
        </g>
      </svg>
    `)
  }
];
