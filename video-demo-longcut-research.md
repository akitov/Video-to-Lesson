# Longcut.ai Reference Project Research

**Repo:** [github.com/SamuelZ12/longcut](https://github.com/SamuelZ12/longcut)
**License:** GNU AGPL v3.0
**Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, Supabase, Stripe

---

## 1. How Longcut Fetches YouTube Transcripts

Longcut does **not** use YouTube's built-in transcript/captions API. It uses a third-party service called **[Supadata](https://supadata.ai)**.

### API Call

**File:** `app/api/transcript/route.ts`

```
GET https://api.supadata.ai/v1/transcript?url=https://www.youtube.com/watch?v={videoId}&lang={lang}
```

- **Auth:** `x-api-key` header from `SUPADATA_API_KEY` env var
- **Response:** Raw caption track segments with `offset`/`start` + `duration` fields (~3-5 second chunks per segment)

### Why It Differs from YouTube's Page Transcript

Supadata returns the **underlying caption track data** with per-phrase timing (fine-grained, potentially overlapping segments), while YouTube's video page shows coarser display blocks grouped by visual display timing.

### Post-Processing Pipeline

1. **`transformSegments()`** (in `app/api/transcript/route.ts`)
   - Detects whether timestamps are in milliseconds or seconds (samples first 5 segments, if avg offset > 500 assumes ms)
   - Normalizes field names (`offset`/`start` -> `start`, `text`/`content` -> `text`)

2. **`lib/transcript-sentence-merger.ts`** — `mergeTranscriptSegmentsIntoSentences()`
   - Merges raw fragments into full sentences by detecting punctuation boundaries (`.`, `!`, `?`, CJK equivalents)
   - Handles edge cases: periods in URLs/decimals/abbreviations are not treated as sentence boundaries
   - Hard limits: max 24 seconds, max 80 words, max 20 segments per merged sentence
   - Result: full sentences with timestamps derived from first segment's `start` and sum of constituent durations

3. **`lib/transcript-format-detector.ts`**
   - Detects "old" format (raw segments) vs "new" format (merged sentences) based on punctuation ratio and average text length
   - Can auto-upgrade old-format transcripts at runtime via `ensureMergedFormat()`

4. **`lib/transcript-language.ts`**
   - Assesses whether transcript is English using character ratio analysis
   - Language retry logic: if transcript coverage < 50% of expected duration, tries alternative languages from `availableLanguages`

### Complete Data Flow

1. Client sends POST to `/api/transcript` with `{ url, lang?, expectedDuration? }`
2. API route extracts `videoId` from the URL
3. Fetches from Supadata with video URL and optional language
4. Retry logic: if coverage < 50% of expected duration, tries alternative languages
5. `transformSegments()`: normalizes timestamps and field names
6. `mergeTranscriptSegmentsIntoSentences()`: combines fragments into full sentences
7. Returns JSON with `{ videoId, transcript, language, availableLanguages, transcriptDuration, isPartial, coverageRatio, ... }`

---

## 2. AI Prompts for Topics and Reels

**Primary AI model:** xAI Grok (`grok-4-1-fast-non-reasoning`), with Google Gemini as automatic fallback on 502/503/504/timeout errors.

**Provider architecture:** `lib/ai-client.ts` -> `lib/ai-providers/registry.ts` -> adapters (`grok-adapter.ts`, `gemini-adapter.ts`)

---

### 2a. Topic Keywords (tags like "Claude Code", "Agentic Coding")

**File:** `lib/ai-processing.ts`, function `generateThemesFromTranscript()` (~line 1385)

```markdown
## Persona
You are an expert content analyst and a specialist in semantic keyword extraction.

## Objective
Analyze the provided video transcript to identify and extract its core concepts.
Generate a list of 5-7 keywords or short key phrases that precisely capture the
main topics discussed without overlapping.

## Strict Constraints
1. Quantity: 5-7 keywords/phrases
2. Length: 1-3 words each
3. Format: Simple unnumbered bulleted list
4. Distinctness: Each keyword must capture a meaningfully different angle

## Guiding Principles
- Specificity over Generality
- Focus on 'What', not 'About'
- Identify Nouns and Noun Phrases

## Distinctness Guardrails
- Cover different facets (challenges, solutions, frameworks, stakeholders, outcomes)
- Avoid re-using the same head noun
- Skip synonyms or simple adjective swaps

## Examples
- Good: `Student motivation` (specific, concise)
- Bad: `Future of education` (too vague)
- Bad: `Selection effects and scalability issues in private education` (too long)
```

Results go through deduplication and diversity promotion logic (`promoteDistinctThemes`).

---

### 2b. Highlight Reels / Segments (clips with timestamps and titles)

**File:** `lib/ai-processing.ts`, function `generateTopicsFromTranscript()` (~line 778)

Two modes depending on video length:

#### Smart Mode (shorter videos) — Single-Pass

Function: `runSinglePassTopicGeneration()` (~line 490)

```xml
<task>
<role>You are an expert content strategist.</role>
<goal>Analyze the provided video transcript and description to create between
one and five distinct highlight reels that let a busy, intelligent viewer
absorb the video's most valuable insights in minutes.</goal>
<audience>The audience is forward-thinking and curious. They have a short
attention span and expect contrarian insights, actionable mental models,
and bold predictions rather than generic advice.</audience>
<instructions>
  <step name="IdentifyThemes">
    - Surface no more than five high-value themes
    - Insightful: Challenge a common assumption
    - Specific: Avoid vague wording
    - Titles as crisp statements, max 10 words
    - Temporal distribution: cover beginning, middle, and end
  </step>
  <step name="SelectPassage">
    - Pick single most representative passage per theme
    - Verbatim transcript sentences only
    - Self-contained, high-signal, no fluff
    - Target ~60 seconds (45-75s range)
  </step>
</instructions>
<outputFormat>[{"title":"string","quote":{"timestamp":"[MM:SS-MM:SS]",
"text":"exact quoted text"}}]</outputFormat>
</task>
```

#### Fast Mode (longer videos) — Chunk + Reduce Pipeline

**Stage 1: Chunk extraction** — `buildChunkPrompt()` (~line 205)
- Transcript split into **5-minute chunks with 45-second overlap**
- Each chunk: extract up to **2 candidates** with titles, verbatim quotes, `[MM:SS-MM:SS]` timestamps
- Focus on "contrarian insights, vivid stories, or data-backed arguments"

**Stage 2: Reduce/curate** — `buildReducePrompt()` (~line 258)
- Candidates split into two temporal segments (first 60% and last 40% of video)
- Each segment curated separately
- Choose strongest, most distinct ideas; remove overlaps
- May rewrite titles for clarity but must keep quote text and timestamps as-is
- Output: `[{"candidateIndex":number,"title":"string"}]`

#### Post-AI Processing

After AI returns topics with quote text and timestamps, **`lib/quote-matcher.ts`** (`findExactQuotes()`) uses fuzzy text matching to precisely locate quoted passages in the transcript and compute exact segment boundaries with character-level offsets.

---

### 2c. Other AI Prompts

| Feature | File | Purpose |
|---|---|---|
| Key Takeaways | `lib/prompts/takeaways.ts` | 4-6 high-signal takeaways with timestamps |
| Top Quotes | `app/api/top-quotes/route.ts` | Up to 5 most quotable lines, ordered by impact |
| Quick Preview | `app/api/quick-preview/route.ts` | 3-4 sentence video overview to hook viewers |
| Suggested Questions | `app/api/suggested-questions/route.ts` | Follow-up questions answerable from transcript |
| Chat | `app/api/chat/route.ts` | Conversational AI grounded in transcript with citations |

---

## 3. Full Architecture Overview

### External Services

| Service | Purpose |
|---|---|
| **Supadata** | YouTube transcript fetching (`api.supadata.ai/v1/transcript`) |
| **xAI Grok** | Primary AI model (`grok-4-1-fast-non-reasoning`) |
| **Google Gemini** | Fallback AI model |
| **Supabase** | Auth (email OTP), Postgres DB, session management |
| **Stripe** | Payments, subscriptions, credit-based usage |
| **Postmark** | Transactional email |
| **Google Cloud Translation** | Transcript translation |
| **YouTube oEmbed** | Video metadata (thumbnails, titles) |

### Key Files

| File | Purpose |
|---|---|
| `app/api/transcript/route.ts` | Transcript fetching via Supadata |
| `lib/transcript-sentence-merger.ts` | Merges raw segments into sentences |
| `lib/transcript-format-detector.ts` | Detects/upgrades transcript formats |
| `lib/transcript-language.ts` | Language detection and assessment |
| `lib/ai-processing.ts` | All topic/reel generation prompts and logic |
| `lib/ai-client.ts` | Public AI entry point |
| `lib/ai-providers/registry.ts` | Provider selection with automatic fallback |
| `lib/ai-providers/grok-adapter.ts` | xAI Grok HTTP adapter |
| `lib/ai-providers/gemini-adapter.ts` | Google Gemini adapter |
| `lib/quote-matcher.ts` | Fuzzy matching to locate quotes in transcript |
| `lib/prompts/takeaways.ts` | Takeaways prompt |
| `app/api/top-quotes/route.ts` | Top quotes prompt |
| `app/api/quick-preview/route.ts` | Quick preview prompt |
| `app/api/suggested-questions/route.ts` | Suggested questions prompt |
| `app/api/chat/route.ts` | Chat with transcript prompt |

### Application Routes

| Route | Description |
|---|---|
| `/` | Landing page with URL input |
| `/analyze/[videoId]` | Main workspace: player, highlights, summary, chat, transcript, notes |
| `/v/[slug]` | Slug-based video page |
| `/my-videos` | Saved/favorited videos library |
| `/all-notes` | Cross-video notes dashboard |
| `/settings` | Profile and preferences |
| `/pricing` | Subscription pricing |
