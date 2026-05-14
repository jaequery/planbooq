export type LandingLayoutId = "classic" | "noir" | "magazine" | "alternate" | "editorial";

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
  editorialA?: string;
  editorialB?: string;
  editorialReadyHead?: string;
  editorialReadyBody?: string;
};

export type LandingVariant = {
  id: string;
  label: string;
  layout: LandingLayoutId;
  copy: LandingCopy;
};

export const LANDING_COPY_VARIANTS = [
  {
    id: "classic",
    label: "Classic split",
    layout: "classic",
    copy: {
      headline: "Stop juggling Linear and Cursor. Ship from one board.",
      subhead:
        "Plan the work, dispatch AI agents, ship every ticket from a single board. Built for founders, PMs, and designers—not only engineers.",
      primaryCta: "Start building",
      secondaryCta: "Mac app",
      valueA:
        "We merged the best parts of modern vibe coding—planning plus harnessed execution—so speed and output stay in one loop.",
      valueB:
        "We routinely keep ten tickets moving at once; parallel beats babysitting one thread.",
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
    },
  },
  {
    id: "noir",
    label: "Noir band",
    layout: "noir",
    copy: {
      eyebrow: "One harness",
      headline: "Ship more. Tab less.",
      subhead:
        "Plan on the board, dispatch to AI, ship without losing the plot. The workflow founders, PMs, and designers have been waiting for.",
      primaryCta: "Start building",
      secondaryCta: "Mac app",
      valueA: "Parallel lanes beat one linear thread—we dogfood with many tickets in flight.",
      valueB: "Review stays lightweight: see status on the card, ship, grab the next idea.",
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
    },
  },
  {
    id: "magazine",
    label: "Magazine",
    layout: "magazine",
    copy: {
      headline: "One board replaces Linear, Cursor, and the chaos between them.",
      subhead:
        "Plan the work, fan it across AI agents, watch tickets ship in parallel. No more terminal-by-terminal babysitting, no more mystery status.",
      primaryCta: "Start building",
      secondaryCta: "Mac app",
      valueA:
        "We merged the best parts of modern vibe coding—planning plus harnessed execution—so speed and output stay in one loop.",
      valueB:
        "We routinely keep ten tickets moving at once; parallel beats babysitting one thread.",
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
    },
  },
  {
    id: "alternate",
    label: "Alternate",
    layout: "alternate",
    copy: {
      headline: "Every ticket gets a branch, an agent, and a finish line.",
      subhead:
        "Plan, harness, ship in one place. AI maxes throughput while you keep the queue honest—every lane visible, every status live.",
      primaryCta: "Start building",
      secondaryCta: "Mac app",
      valueA: "Founders, PMs, designers, and operators—everyone sees the same live board.",
      valueB: "We routinely run ten tickets at once; parallel work is the default, not a flex.",
      philosophyHeading: "Plan here. Ship everywhere else—with less chaos.",
      philosophyBody1:
        "Connect GitHub-shaped tickets, watch agents chew through the build column, and keep costs sane with BYOK when you want full control.",
      trustHeadA: "No black boxes—status stays where you already look: on the card.",
      trustBody:
        "Each ticket keeps its lane tidy, automation stays visible, and review stays a quick glance before you move on to the next idea.",
      finalHeading: "Your next web push starts on one board.",
    },
  },
  {
    id: "editorial",
    label: "Editorial",
    layout: "editorial",
    copy: {
      headline: "Plan it. Dispatch it. Ship it.",
      subhead:
        "AI handles execution. You steer what ships next. One board, ten parallel lanes, zero stale tabs—even if you are not writing code daily.",
      primaryCta: "Start building",
      secondaryCta: "Mac app",
      valueA:
        "We merged the best parts of modern vibe coding—planning plus harnessed execution—so speed and output stay in one loop.",
      valueB:
        "We routinely keep ten tickets moving at once; parallel beats babysitting one thread.",
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
      editorialA:
        "Writing is cheap—keeping ten initiatives moving without dropping context is not.",
      editorialB:
        "Planbooq is the harness: AI does the grind, the board stays honest, merges stay boring.",
      editorialReadyHead: "Ready when you are.",
      editorialReadyBody:
        "Hiring, side project, or full sprint—same ritual: open the board, start the next lane.",
    },
  },
  {
    id: "solo-founder",
    label: "Solo founder",
    layout: "alternate",
    copy: {
      headline: "Ship like a team of ten. Alone.",
      subhead:
        "Fan out ten tickets, let AI crank the build lane, stay close to the customer. Solo, never slow—and never another tab to chase.",
      primaryCta: "Start building",
      secondaryCta: "Mac app",
      valueA:
        "One human, ten lanes—Planbooq turns parallel into a habit instead of a heroic effort.",
      valueB:
        "Plan, harness, ship in one place; no second app to remember when the day gets weird.",
      philosophyHeading: "A second pair of hands that never asks for a meeting.",
      philosophyBody1:
        "Drop a ticket, hand it to an agent, get back to talking to users. The build lane keeps moving while you keep the product honest.",
      trustHeadA: "Your roadmap and your runway, both on one card.",
      trustBody:
        "BYOK keeps costs yours; the board keeps state yours; nothing about your work hides in another tab.",
      finalHeading: "Start the next ten tickets—then go talk to a user.",
    },
  },
  {
    id: "ai-first-pm",
    label: "AI-first PM",
    layout: "classic",
    copy: {
      headline: "Every ticket runs itself. You drive the queue.",
      subhead:
        "GitHub-shaped tickets, a worktree per agent, CI status back on the card. You set direction; the harness ships the code.",
      primaryCta: "Run a ticket",
      secondaryCta: "Mac app",
      valueA:
        "Tickets carry branches, PRs, and CI back to the lane—no copy-pasting status between Linear and Slack.",
      valueB: "Reviews stay glance-sized: open the diff, ship, grab the next card.",
      philosophyHeading: "Specs go in, shipped work comes out.",
      philosophyBody1:
        "Write the ticket once. The agent forks a worktree, builds the branch, opens the PR, and reports back to the same card you started on.",
      philosophyBody2:
        "Merge moves the ticket. Status lives in one place. Your PM ritual finally stops fighting your dev ritual.",
      trustHeadA: "No more “which doc was the source of truth?”",
      trustHeadB: "The card is the source of truth.",
      trustBody:
        "Every ticket carries its branch, PR, checks, and history. The board is what your team and your agents both read from.",
      finalHeading: "Stand up the queue. Let the agents fight it.",
    },
  },
  {
    id: "indie-hacker",
    label: "Indie hacker",
    layout: "noir",
    copy: {
      eyebrow: "Side project speed",
      headline: "Ten side projects in flight. Zero burned-out tabs.",
      subhead:
        "BYOK keeps the bill yours. The harness keeps the chaos contained. Ship past the dip—every single weekend, every single idea.",
      primaryCta: "Start building",
      secondaryCta: "Mac app",
      valueA: "Bring your own key, your own pace—Planbooq is the harness, not the meter.",
      valueB:
        "Parallel agents in parallel branches: late-night builds without late-night context loss.",
      philosophyHeading: "Ship the long tail, not the short fuse.",
      philosophyBody1:
        "Half a dozen ideas live on one board, each in its own lane, each with an agent willing to keep typing while you keep deciding.",
      philosophyBody2:
        "Costs stay on your card. State stays on the ticket. Nothing about your stack hides in someone else’s dashboard.",
      trustHeadA: "No “where was I last Tuesday?”",
      trustHeadB: "The board remembers so you don’t have to.",
      trustBody:
        "Each ticket is its own branch, its own thread, its own little memory. Pick one up cold and the lane tells you where it left off.",
      finalHeading: "Your weekend just got more leverage.",
    },
  },
  {
    id: "designer-friendly",
    label: "Designer-friendly",
    layout: "magazine",
    copy: {
      headline: "From Figma to shipped, on one board.",
      subhead:
        "Drop a ticket, sketch the intent, dispatch an AI agent. You keep taste in the loop while the code writes itself—no Cursor required.",
      primaryCta: "Start building",
      secondaryCta: "Mac app",
      valueA: "Designers and PMs steer the board; AI handles the keystrokes.",
      valueB: "Reviewing a PR is a glance, not a context switch.",
      philosophyHeading: "Taste in, build out.",
      philosophyBody1:
        "Tickets carry the intent, the agents carry the syntax, and the build lane keeps everyone honest about what shipped versus what was promised.",
      philosophyBody2:
        "Stay in the work you actually want to do—flow, copy, motion—while the harness owns the boring keystrokes.",
      trustHeadA: "No more “did the engineer get my comment?”",
      trustHeadB: "The card has the asset, the diff, and the decision.",
      trustBody:
        "Every ticket keeps the design intent, the PR, and the review thread together—so taste survives the trip from board to production.",
      finalHeading: "Design the next feature, then ship it from the same board.",
      magazineLeadA: "Design taste with engineering throughput.",
      magazineLeadB:
        "The harness keeps execution honest so you can stay close to the work—colors, copy, flow—and let agents own the typing.",
    },
  },
  {
    id: "engineering-lead",
    label: "Engineering lead",
    layout: "editorial",
    copy: {
      headline: "Ten agents in parallel. One trustworthy queue.",
      subhead:
        "Stop babysitting one terminal. Spin a worktree per ticket, dispatch agents across the build lane, and let CI roll status back to the card.",
      primaryCta: "Start building",
      secondaryCta: "Mac app",
      valueA: "Ten tickets, ten worktrees, ten agents—your queue, not a screenful of stale tabs.",
      valueB: "Merges stay boring because reviews stay small.",
      philosophyHeading: "One harness for the whole team’s velocity.",
      philosophyBody1:
        "Every ticket gets its own branch, its own agent session, and its own slot on the board. Your team’s throughput stops scaling with how many terminals one human can watch.",
      philosophyBody2:
        "Status flows from CI back to the card. Reviews stay PR-sized. The queue, not the chat, is the source of truth.",
      trustHeadA: "No more “who’s on what right now?”",
      trustHeadB: "The board is the standup.",
      trustBody:
        "Lanes tell the story: who’s building, what’s in review, what just merged. The work narrates itself instead of waiting on a meeting.",
      finalHeading: "Ten lanes. One queue. Zero babysitting.",
      editorialA:
        "Writing was cheap; running ten parallel builds without losing the plot is the new bottleneck.",
      editorialB:
        "Planbooq is the harness for that bottleneck: every ticket has a lane, every lane has a worker, every worker reports back.",
      editorialReadyHead: "Ship the queue, not the toil.",
      editorialReadyBody:
        "Hire, scope, sprint—same ritual: open the board, start the next lane, let the harness handle the boring middle.",
    },
  },
] as const satisfies readonly LandingVariant[];

export type LandingVariantIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const LANDING_VARIANT_COUNT = LANDING_COPY_VARIANTS.length;
