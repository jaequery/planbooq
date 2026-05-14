export type LandingCopy = {
  eyebrow?: string;
  headline: string;
  subhead: string;
  primaryCta: string;
  secondaryCta: string;
  valueA: string;
  valueB: string;
  philosophyHeading: string;
  philosophyBody1: string;
  philosophyBody2?: string;
  trustHeadA: string;
  trustHeadB?: string;
  trustBody: string;
  finalHeading: string;
  magazineLeadA?: string;
  magazineLeadB?: string;
};

export const LANDING_COPY: LandingCopy = {
  headline: "One board replaces Linear, Cursor, and the chaos between them.",
  subhead:
    "Plan the work, fan it across AI agents, watch tickets ship in parallel. No more terminal-by-terminal babysitting, no more mystery status.",
  primaryCta: "Start building",
  secondaryCta: "Download for Mac",
  valueA:
    "We merged the best parts of modern vibe coding—planning plus harnessed execution—so speed and output stay in one loop.",
  valueB: "We routinely keep ten tickets moving at once; parallel beats babysitting one thread.",
  philosophyHeading: "Everything for a web project—without the tool soup",
  philosophyBody1:
    "Planbooq folds planning and AI execution into one harness so founders, PMs, designers, and builders keep parallel tickets moving—often ten at a time—without bouncing between Linear and Cursor.",
  philosophyBody2:
    "Bring your own key when you want, watch agents own the build lane, keep merges boring.",
  trustHeadA: "No “wait, which tab had the truth?”",
  trustHeadB: "Status lives on the card where everyone can see it.",
  trustBody:
    "Each ticket stays in its own lane, automation stays visible, review stays a quick glance—so work keeps moving instead of getting lost between apps.",
  finalHeading: "Your next web push starts on one board.",
  magazineLeadA: "Speed with a clear flight path.",
  magazineLeadB:
    "Not another overloaded planner. A live board where each ticket has an execution lane, you can watch progress at a glance, and ten streams stay civilized instead of chaotic.",
};
