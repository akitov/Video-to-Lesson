# Plan: Add Slide Presentation System

## Context

The current video exploration tool (interactive player + sidebar) becomes one "activity" inside a larger presentation. We need to wrap it in a slide system where 10-20 additional static slides each present a single pre-defined segment with text + constrained video player. The prev/next arrows in the top nav bar navigate between slides with alpha fade transitions.

## Architecture

### Slide Container System

Wrap the existing content (`.main` + `.resize-handle-v` + `.sidebar`) inside a `<div class="slide slide-interactive">` that occupies `grid-row: 2; grid-column: 1 / -1`. Each static slide is a sibling `<div class="slide slide-segment">` in the same grid cell. Only one slide is visible at a time; transitions use CSS `opacity` with a ~300ms ease.

```
.app grid:
  row 1: .topnav (auto height, spans all columns)
  row 2: .slide containers (stacked via position absolute/relative, only one visible)
```

### Static Slide Layout (per reference image)

Each static slide is a two-column flexbox:
- **Left column (30%)**: segment title (bold, ~28px), bullet points (~16px), time range/duration — all vertically centered
- **Right column (70%)**: YouTube iframe (no controls except play/pause overlay), vertically centered, `overflow: hidden` to mask when below min-width

```html
<div class="slide slide-segment" data-slide-index="N">
  <div class="slide-content">
    <div class="slide-text-col">
      <div class="slide-text-inner">
        <h2 class="slide-title">Segment Label</h2>
        <p class="slide-description">Bullet points...</p>
        <div class="slide-meta">2:56 – 4:24 · 1m 28s</div>
      </div>
    </div>
    <div class="slide-video-col">
      <div class="slide-video-wrap" id="slide-player-N">
        <!-- YouTube iframe injected here -->
      </div>
      <button class="slide-play-btn">▶</button>
    </div>
  </div>
</div>
```

CSS for the video column: `width: 70%; overflow: hidden;` with the video inside at `width: 100%; min-width: 640px;` — if the column shrinks below 640px the video is clipped rather than squeezed.

### SlideManager (new JS class ~80-100 lines)

Responsibilities:
- Maintains `currentSlideIndex` and a `slides[]` config array
- Wires the topnav prev/next arrow buttons (`.topnav-arrow-btn`)
- On transition: fade out current slide (opacity 0), after 300ms set `display:none`, set next slide `display:flex; opacity:0`, then animate to opacity 1
- Updates the nav subtitle text ("Activity X of Y")
- Manages video lifecycle for static slides: create `YouTubeAdapter` when a segment slide becomes active, destroy when leaving it
- Enforces segment boundaries on static slides (poll-based snap-back, same pattern as the main app)
- Provides a simple play/pause toggle overlay on the video

### Slide Configuration

The slides array will be defined in `index.html` as a JS array. The user will specify which segments (by `seg-XXX` id) map to which slide positions. The interactive tool is one entry with `type: 'interactive'`. Example:

```js
const SLIDES = [
  { type: 'segment', segmentId: 'seg-001' },
  { type: 'segment', segmentId: 'seg-002' },
  { type: 'interactive' },  // the existing video exploration tool
  { type: 'segment', segmentId: 'seg-005' },
  // ... more
];
```

This makes it trivial for the user to reorder or add/remove slides by editing the array.

## Files to Modify

| File | Changes |
|------|---------|
| `index.html` | Add SlideManager class, slide CSS, wrap existing content in a slide div, render static slides, wire nav buttons, add SLIDES config array |

No new files needed — everything stays in the single `index.html`.

## Implementation Steps

1. **Add slide CSS** (~40 lines): `.slide`, `.slide-content`, `.slide-text-col`, `.slide-video-col`, `.slide-video-wrap`, `.slide-play-btn`, fade transition classes
2. **Add `SLIDES` config array** at the top of the script section with placeholder segment IDs (user will adjust later)
3. **Add `SlideManager` class** (~80-100 lines): constructor takes slides config + topic data, manages transitions, video lifecycle, nav button wiring
4. **Modify `_renderShell()`**: wrap `.main` + `.resize-handle-v` + `.sidebar` inside `<div class="slide slide-interactive" data-slide-index="X">`
5. **Render static slides**: SlideManager generates the HTML for each segment slide and appends to the `.app` grid
6. **Wire topnav arrows**: attach click handlers to `.topnav-arrow-btn` buttons for prev/next
7. **Update topnav subtitle**: reflect "Activity X of Y" on slide change
8. **Video lifecycle**: create YouTubeAdapter when entering a segment slide, destroy when leaving. Enforce segment boundaries with 100ms polling. Play/pause overlay button.
9. **Deferred loading**: only the active slide's video is loaded; others have a placeholder. The interactive slide's App is initialized once and preserved (not destroyed on slide change, just hidden).

## Key Design Decisions

- **Interactive slide preserved**: When navigating away from the interactive slide, it's hidden (`display:none`) but NOT destroyed. The YouTube player and all state persist. When returning, it resumes where the user left it.
- **Static slide videos are ephemeral**: Created on enter, destroyed on leave, to avoid having multiple YouTube iframes active simultaneously.
- **Fade transition**: Pure CSS opacity transition (300ms ease). During transition, both slides briefly coexist in the DOM (one fading out, one fading in).
- **No horizontal resize on static slides**: The two-column layout is fixed 30/70 split, no drag handle.

## Verification

1. `python3 -m http.server 8080`, open `http://localhost:8080/index.html`
2. App starts on slide 0. Clicking right arrow fades to slide 1.
3. Each static slide shows segment title, bullets, time range on left; video player on right
4. Video on static slide is restricted to segment time range (can't seek outside)
5. Play/pause works on static slides
6. Clicking left arrow goes back; interactive slide resumes where it was left
7. Nav subtitle updates ("Activity 1 of N", "Activity 2 of N", etc.)
8. Resize browser window — video column clips gracefully when narrow
