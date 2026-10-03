import type { SVGProps } from "react";

const base = (d: string | string[], props: SVGProps<SVGSVGElement>) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
    {(Array.isArray(d) ? d : [d]).map((p, i) => (
      <path key={i} d={p} />
    ))}
  </svg>
);

type P = SVGProps<SVGSVGElement>;
export const IconKanban = (p: P) => base(["M4 4h4v16H4z", "M10 4h4v10h-4z", "M16 4h4v13h-4z"], p);
export const IconCalendar = (p: P) => base(["M3 6h18v15H3z", "M3 10h18", "M8 3v4", "M16 3v4"], p);
export const IconShield = (p: P) => base(["M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z", "M12 8v5", "M12 16h.01"], p);
export const IconBuilding = (p: P) => base(["M4 21V5l8-3 8 3v16", "M9 21v-5h6v5", "M8 9h.01", "M12 9h.01", "M16 9h.01", "M8 13h.01", "M12 13h.01", "M16 13h.01"], p);
export const IconHistory = (p: P) => base(["M3 12a9 9 0 1 0 3-6.7L3 8", "M3 3v5h5", "M12 7v5l3 2"], p);
export const IconSettings = (p: P) =>
  base(
    [
      "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
      "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
    ],
    p,
  );
export const IconEuro = (p: P) => base(["M17 5.5A7 7 0 1 0 17 18.5", "M4 10h10", "M4 14h10"], p);
export const IconServer = (p: P) => base(["M4 4h16v6H4z", "M4 14h16v6H4z", "M8 7h.01", "M8 17h.01"], p);
export const IconPlus = (p: P) => base(["M12 5v14", "M5 12h14"], p);
export const IconX = (p: P) => base(["M6 6l12 12", "M18 6L6 18"], p);
export const IconChevron = (p: P) => base("M9 6l6 6-6 6", p);
export const IconChevronDown = (p: P) => base("M6 9l6 6 6-6", p);
export const IconUp = (p: P) => base("M6 15l6-6 6 6", p);
export const IconDown = (p: P) => base("M6 9l6 6 6-6", p);
export const IconTrash = (p: P) => base(["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 13h10l1-13", "M9 7V4h6v3"], p);
export const IconDownload = (p: P) => base(["M12 4v12", "M7 11l5 5 5-5", "M4 20h16"], p);
export const IconSparkles = (p: P) => base(["M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z", "M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z", "M5 16l.6 1.4L7 18l-1.4.6L5 20l-.6-1.4L3 18l1.4-.6z"], p);
export const IconComment = (p: P) => base("M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z", p);
export const IconCopy = (p: P) => base(["M9 9h11v11H9z", "M5 15H4V4h11v1"], p);
export const IconSun = (p: P) => base(["M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M12 2v2", "M12 20v2", "M4.9 4.9l1.4 1.4", "M17.7 17.7l1.4 1.4", "M2 12h2", "M20 12h2", "M4.9 19.1l1.4-1.4", "M17.7 6.3l1.4-1.4"], p);
export const IconMoon = (p: P) => base("M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z", p);
export const IconLogout = (p: P) => base(["M9 21H5V3h4", "M16 17l5-5-5-5", "M21 12H9"], p);
export const IconUsers = (p: P) => base(["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M22 21v-2a4 4 0 0 0-3-3.9", "M16 3.1a4 4 0 0 1 0 7.8"], p);
export const IconInfo = (p: P) => base(["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 16v-4", "M12 8h.01"], p);
export const IconSend = (p: P) => base(["M22 2L11 13", "M22 2l-7 20-4-9-9-4z"], p);
export const IconHome = (p: P) => base(["M3 11l9-8 9 8", "M5 10v10h14V10"], p);
export const IconMenu = (p: P) => base(["M4 6h16", "M4 12h16", "M4 18h16"], p);
export const IconAlert = (p: P) => base(["M12 3l10 18H2z", "M12 10v4", "M12 17h.01"], p);
export const IconEdit = (p: P) => base(["M12 20h9", "M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"], p);
export const IconArrowRight = (p: P) => base(["M5 12h14", "M13 6l6 6-6 6"], p);
