# Planbooq — launch tweet candidates

## 1. Primary tweet

the bottleneck in vibe coding isn't writing code anymore. it's deciding on AI output. prompt → wait → "almost" → re-prompt → ship something you settled for. building Planbooq: a kanban where one ticket fans out N variants. you pick the winner. you don't prompt twice.

**Char count:** 267
**Hook (first 7 words):** "the bottleneck in vibe coding isn't writing"

## 2. Alternate angles

### 2a. Anti-status-quo angle (Lovable + Cursor + Linear is broken)
> Lovable + Cursor + Linear is three tools built for three different eras stitched together with vibes. one generates, one refines, one tracks — none of them know what to do when an AI gives you five candidate answers. building the surface that does. it's called Planbooq.

**Char count:** 270
**Rationale:** Names the incumbents directly. Each gets quoted by curious followers of those tools. The "stitched together with vibes" line is a quotable slap that lands as honest critique, not a cheap shot.
**Predicted reaction:** Replies from Lovable / Cursor power users defending or agreeing; quote-tweets from people whose stack is exactly those three; founder-tier accounts pile in because the tri-tool diagnosis is one they've been muttering privately.

### 2b. Founder-philosophical angle (the bottleneck has moved)
> AI writes code faster than any human can review it. so why is every tool still optimized for writing? we don't specify taste. we recognize it. building Planbooq — a kanban where the unit of work isn't a task, it's a decision between variants you didn't have to prompt twice for.

**Char count:** 278
**Rationale:** Pure manifesto. The "specify vs recognize" couplet reframes the entire vibe-coding workflow as a category error and is highly screenshot-able. Founder-on-X energy without performative hot-take vibes.
**Predicted reaction:** Bookmarks and quote-tweets from people who design tools (Karpathy-orbit, Geoffrey Litt-orbit, latent.space crowd). The "we recognize taste, we don't specify it" line is the kind of thing that gets pulled into other people's threads for weeks.

### 2c. Demo-bait angle (one-line tease begging a video reply)
> spent the weekend building a kanban where one ticket spawns N AI variants in parallel and you pick the winner hot-or-not style instead of re-prompting. demo soon. it's called Planbooq.

**Char count:** 184
**Rationale:** Casual, builder-in-public framing. "Hot-or-not style" is the imagery hook — instantly visualizable. Short on purpose so quote-tweets can stack a comment on top. Implicitly promises a video, which trains follow-back behavior.
**Predicted reaction:** "drop the demo" replies, "let me know when it's live", DMs asking for early access. High signal-to-noise comments. The follow-up clip then 3x's reach off the original.

### 2d. Numeric / proof-shape angle (e.g. "N variants per prompt, pick in seconds")
> one prompt. N variants in parallel. each with its own preview URL and screenshots. you pick in seconds, not iterations. that's the bet behind Planbooq — a kanban built for the era where AI writes code faster than you can direct it.

**Char count:** 231
**Rationale:** Mechanism-shaped. The "one prompt → N variants → preview URLs → pick in seconds" rhythm reads like a spec, which is what builders trust. "That's the bet" admits this is a thesis not a feature list — keeps it honest given variants aren't shipped yet.
**Predicted reaction:** Replies asking implementation questions (worktrees? sandboxes? cost?). Saves and bookmarks from builders thinking about parallel agent orchestration.

### 2e. Dev-meme angle
> my prompts → claude → "almost but not quite" → my prompts again → "closer" → my prompts again → ship whatever. this is not a workflow. it's stockholm syndrome. building Planbooq to break it.

**Char count:** 190
**Rationale:** Names the universal pain in the exact words people mutter to themselves. "Stockholm syndrome" is the line — it's mean about the situation, not about anyone using these tools, so it's safe to laugh at. Lands without being cringe because it's first-person, not finger-pointy.
**Predicted reaction:** High retweet count from anyone who has ever fought a code-gen loop. Quote-tweets adding their own "almost but not quite" stories. Likely the fastest-spreading of the five.

## 3. Thread variant (4–6 tweets)

**Built on:** 2e — the "stockholm syndrome" frame is the strongest viral hook of the five because it lets the reader laugh at their own behavior without anyone having to be the villain. The other angles are sharper diagnoses, but 2e is the one a reader *forwards to a friend* with "this is literally me." That's the frame that earns thread expansion.

**Thesis arc:**
1. Hook: claim every vibe coder has stockholm syndrome — falsifiable, makes the reader want to argue or agree.
2. Mechanism: explain *why* the loop hurts — taste is recognizable, not specifiable.
3. Belief contradicted: "good prompts produce good output" is wrong. Good *picks* produce good output.
4. Personal anchor: you shipped something this week you settled for. You picked by exhaustion, not taste.
5. Closer + CTA: name what we're building, ask for the follow / DM.

---

**Tweet 1 of 5 (hook)**
> every vibe coder has stockholm syndrome and doesn't know it.
>
> prompt → "almost" → reprompt → "closer" → reprompt → ship whatever.
>
> you've convinced yourself this is a workflow. it's not. it's a hostage situation with extra steps.

**Char count:** 230

**Tweet 2 of 5**
> the reason it hurts: you're trying to *specify* taste in english. you can't. taste is recognizable, not specifiable. you know it when you click it. every loop spent describing is a loop not spent picking.

**Char count:** 202

**Tweet 3 of 5**
> the belief we're contradicting: "good prompts produce good output." they don't. good *picks* produce good output. the prompt is just the seed. ten seeds, one pick, every time. that's not a workflow change. that's a category change.

**Char count:** 231

**Tweet 4 of 5**
> be honest. you shipped something last week that wasn't quite right. you were tired. the loop was three reprompts deep. you said "fine" and merged it. you didn't pick the best version. you picked the version you had energy left to evaluate.

**Char count:** 237

**Tweet 5 of 5**
> Planbooq is a kanban where one ticket fans out N variants in parallel — each with a preview URL — and you pick the winner. that's the bet we're building toward.
>
> closed alpha. follow for the demo, or DM "alpha" if you want in early.

**Char count:** 232

## 4. Reply-bait

> if your AI coding tool only generates one option per prompt, it's not an AI tool. it's a typewriter with extra latency. serious builders need to evaluate, not dictate.

**Char count:** 167
**Why it baits:** Activates the "I am a serious builder, not a prompt monkey" identity. Anyone running Cursor/Lovable/Copilot reads this and has to decide whether to defend their workflow ("one good prompt is enough if you know what you're doing") or co-sign it ("yeah the single-shot loop is broken"). Both reactions are quote-tweets. The "typewriter with extra latency" image is sticky enough to get screenshotted, and "evaluate, not dictate" gives the QT-er a phrase to either reclaim or rebut — which is exactly the affordance that drives engagement instead of a flame war.

## 5. Notes

### Contrarian hook in use

The primary tweet leans on one line: **"the bottleneck in vibe coding isn't writing code anymore. it's deciding on AI output."** The 2b manifesto sharpens it further with **"we don't specify taste. we recognize it."** Consensus in AI-builder discourse still treats prompt quality as the lever — better prompts, longer prompts, prompt libraries, prompt engineers. This claim says the prompt was never the bottleneck; the human review step is, and every tool optimizing for "write a better prompt" is solving last year's problem. When a reader agrees, they get to feel like they've been quietly noticing this for months and finally see it named.

### Why this phrasing works

- **"prompt → wait → 'almost' → re-prompt → ship something you settled for"** (primary tweet, echoed in 2e and Tweet 1 of the thread) — the arrow-chain mimics the actual texture of the loop, and "ship something you settled for" is the indictment line. It works because it doesn't blame the tool, it blames the outcome the reader already feels guilty about.
- **"you don't prompt twice"** — four words, ends the primary tweet on a verb the reader has done a thousand times this week. The negation does the work; it implies a world where re-prompting is the failure mode, not the norm.
- **"three tools built for three different eras stitched together with vibes"** (2a) — "stitched together with vibes" is the quotable slap. It earns its slot because "vibes" is the audience's own word turned back on their own stack; it lands as honest, not snide.
- **"taste is recognizable, not specifiable. you know it when you click it."** (Tweet 2 of thread) — diagnosis → mechanism. The "click it" anchor turns an abstract claim into a physical gesture the reader has performed.
- **"good prompts produce good output... they don't. good *picks* produce good output."** (Tweet 3) — the structural trick is the false-belief-then-flip; it baits the reader into agreeing with the cliche before yanking it. "That's not a workflow change. that's a category change" earns the size of the claim.
- **"hostage situation with extra steps"** and **"typewriter with extra latency"** — same imagery family (a known-bad thing + "with extra [tech word]"). Repeatable enough to become a brand tic without being a catchphrase yet.
- **"hot-or-not style"** (2c, README, thread tweet 5) — concrete, instantly visualizable, slightly self-deprecating. Communicates the picking interaction in three words without the founder having to ship a screenshot.
- **What is *not* said:** no feature list, no pricing, no "AI agents" hand-waving, no comparison chart. The thread closer **"that's the bet we're building toward"** quietly admits variants aren't shipped yet — that restraint is the trust move. Builders forgive a thesis, not a demo lie.

### Identities + feelings activated

- **Identity:** the burned-out vibe coder who has run the prompt-reprompt loop for 90 minutes tonight · **Feeling:** "this is literally me, and now I can name it" · **Action:** quote-tweets Tweet 1 ("stockholm syndrome") with their own "almost but not quite" story.
- **Identity:** the serious builder who wants leverage, not autocomplete · **Feeling:** "finally someone said the loop is the problem" · **Action:** quote-tweets the reply-bait ("typewriter with extra latency") to signal taste.
- **Identity:** the tool-designer / latent-space-adjacent thinker who collects framing primitives · **Feeling:** "this couplet is going in my next thread" · **Action:** screenshots **"we don't specify taste. we recognize it."** and bookmarks the manifesto angle (2b).
- **Identity:** the indie hacker watching the Lovable / Cursor / Linear stack for cracks · **Feeling:** "someone's actually going after the seam" · **Action:** replies to 2a naming their own stitched-together stack, asks for alpha.
- **Identity:** the founder-on-X who has been muttering the tri-tool diagnosis privately · **Feeling:** "validated, and a little annoyed I didn't post it first" · **Action:** quote-tweets 2a with a co-sign and an addition, tagging one of the three named tools.

### Do NOT say (jargon graveyard)

The 10 mandatory bans, in order:
- `AI-powered`
- `10x`
- `revolutionize` / `revolutionary` / `revolution`
- `game-changer`
- `next-gen` / `next-generation`
- `supercharge`
- `unleash`
- `unlock`
- `the future of`
- `say goodbye to`

Additional bans, vibe-coding-specific:
- `ChatGPT for X` / `Cursor for X` / `Linear for X` (positions Planbooq as a derivative; the whole pitch is that the category is new).
- `(thread)` or `🧵` markers (the thread itself should earn the read; explicit markers signal performative-thread energy).
- `I built this in a weekend` (only true if it is true; the thesis here is multi-week and the schema admits variants aren't shipped — claiming weekend-build undercuts the manifesto).
- `we're hiring` appended to the launch tweet (dilutes the call-to-action; do it in a separate tweet 48h later).
- `agentic` (overused, means nothing right now to the audience that matters and signals bandwagon to the audience that matters even more).
- `vibes-based` as self-description (own-goal — competitors are "stitched together with vibes," Planbooq is the surface that fixes it).
- `disrupt` / `disruption` (consultant-speak; the thread already does the disruption work without naming it).
- `seamless` / `frictionless` (every SaaS landing page; says nothing).
- `democratize` (founder-cringe trigger word for this audience).
- `let AI do the work for you` (insults the "serious builder" identity the reply-bait is built to activate).

### Reply playbook (founder voice)

- **Person agrees enthusiastically:** one-line co-sign that adds a detail they didn't have ("yeah — and the worst part is the loop trains you to lower your bar"), no thank-yous, no exclamation marks.
- **Person disagrees politely or asks a hard question:** concede the strongest part of their point first, then sharpen the disagreement on a single mechanism — never on identity ("fair — single-shot works when the spec is tight. it falls apart when taste is the spec.").
- **Well-known account quote-tweets:** reply to the QT, not the original; one sentence that extends *their* framing rather than restating yours, because the goal is the second QT from their orbit, not a thank-you.
- **Lovable / Cursor / Linear team account engages:** zero defensiveness, zero retraction; treat them as peers shipping in the same era and name the specific seam Planbooq is targeting ("Linear's the one I respect most here — the gap is just that it has no shape for N candidate answers").
- **Someone asks "how do I get access":** one line, low-friction, not a form ("DM 'alpha' — it's gated by hand right now, will get to you within a day").

