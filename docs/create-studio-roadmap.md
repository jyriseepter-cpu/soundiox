# SoundioX Create / Studio Roadmap

## 1. Core positioning

SoundioX Create is not just an AI music generator.

It should become an AI Music Creation Studio with:
- base track generation
- studio editing
- versioning
- AI co-producer
- artist identity memory
- looper / extend tools

## 2. Base generation

Rules:
- Base generation max length: 180 seconds
- Purpose: fast, affordable starting point / draft / core track
- Provider can be MusicGen first because the raw draft can be improved in Studio
- Quality comes from later human-guided editing, versioning, looper, extend, and co-producer

## 3. Versioning rule

Critical rule:
- Never overwrite original uploaded/generated track
- Every studio action creates a new version / branch

Example:
- Original — 180s
- Version 2 — Extended outro
- Version 3 — Looper 5 min version
- Version 4 — Radio edit
- Version 5 — Remix

## 4. Studio actions

Studio should support:
- Extend Track
- Looper
- Remix
- Instrumental version
- Radio edit
- Add bridge
- Add second drop
- Extend intro
- Extend outro
- Make full-length version
- Make background version

Each action creates a new version.

## 5. Extend Track

Extend Track means generating new musical continuation, not simply repeating audio.

MVP approach:
- use existing track ending or selected section as context
- generate a continuation
- crossfade/stitch with original
- save as new version

Example:
- Original 180s
- Extend outro +45s -> Version 2 225s

## 6. Looper

Looper is separate from Extend.

Looper does not need new AI generation.
It uses existing audio and creates longer versions by looping sections.

Looper use cases:
- 4 min extended mix
- 5 min version
- 10 min background mix
- 30 min shop/radio playlist background loop
- DJ-friendly version
- ambient/retail background version

MVP Looper approach:
- select preset section:
  - last 30s
  - chorus
  - best section
  - outro
- repeat section
- add crossfades
- render a new version
- save as new audio file/version

Important:
- Looper can create tracks longer than 180s because it is an edit/studio action, not base generation.
- Base generation still stays capped at 180s.

## 7. AI Co-Producer memory

AI Co-Producer should learn the artist’s musical identity over time.

It should not feel creepy.
It should not say “we analyzed your behavior”.
It should behave like a producer who remembers the artist’s sound.

AI should remember musical DNA, not raw private data.

Store/extract metadata like:
- genre
- mood
- tempo
- vocal mode
- common structures
- chorus/drop style
- lyrical themes
- sound design notes
- finalDirection
- artwork direction
- previous co-producer decisions

Build an artist style summary from recent tracks.

Example summary:
- melodic EDM
- emotional / nostalgic
- strong chorus lift
- glossy synths
- clean radio-ready structure

Use this summary in future co-producer prompts.

## 8. Co-Producer UX voice

Co-producer should say things like:
- “This feels close to your earlier vibe, but the chorus can open harder.”
- “Your sound is evolving.”
- “You usually go emotional here. Want to keep that or try something darker?”
- “This one is more energetic than your recent tracks.”

## 9. Monetization logic

Base generation belongs inside plan limits.

Studio actions can become credit-based:
- Extend Track = 1 credit
- Looper short version = low-cost / 1 credit
- Full-length Looper / background version = 2 credits
- Full new generation = plan allowance or paid pack

Important:
Users should feel they are developing a song, not paying random AI fees.

## 10. Product moat

The strongest SoundioX loop becomes:

Generate -> Studio edit -> Looper / Extend -> AI co-producer feedback -> New version -> Repeat

This turns SoundioX into:
- AI music creation studio
- AI artist launchpad
- personal AI co-producer
- not just an upload/generator tool

## 11. Implementation order later

Suggested future implementation order:
1. Keep Modal/MusicGen 15s test working first
2. Add storage for generated audio
3. Add version table / version metadata if not already present
4. Add Looper MVP first because it is cheaper than Extend
5. Add Extend Track after Looper
6. Add artist style summary storage
7. Inject style memory into co-producer prompts
8. Add UI badges/text like “Your sound is evolving”
9. Add credit logic later

## 12. Technical notes

Looper technical notes:
- Use ffmpeg for cutting, looping, crossfading, rendering
- MVP can use fixed presets before advanced beat detection
- Later add beat/section detection

Extend technical notes:
- Use selected tail/section as prompt/context
- Generate continuation
- Crossfade and render
- Keep as version

Storage notes:
- All outputs must be stored as new files
- Never replace original audio_url
- Every edit should preserve source version id and action type

## 13. Naming suggestions

Possible Studio buttons:
- Extend Track
- Looper
- Make Full Version
- Make Background Mix
- Add Bridge
- Add Second Drop
- Radio Edit
- Instrumental
- Remix

## 14. Non-goals for now

Do not implement yet:
- real Looper
- real Extend
- beat detection
- credit billing
- full artist memory
- UI redesign

This file is only a roadmap / architecture note.
