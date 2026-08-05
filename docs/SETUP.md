# NovaEdits Setup

## Prerequisites
- Node.js 20+ and npm (already confirmed on this machine).
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

## First-time setup
1. `npm install`
2. `npm run dev` — starts the Vite dev server and launches the Electron window.
3. Add your Gemini API key in Settings → "Gemini API Key" (you can add multiple and switch which one is active — handy for spreading usage across accounts). Alternatively, copy `.env.example` to `.env` and fill in `GEMINI_API_KEY=`; keys added in Settings take priority over the `.env` value.
   **Important:** if you pasted an API key into a chat/log anywhere, rotate it in AI Studio and use the new key here — treat any key that passed through a chat transcript as compromised.

## What's bundled vs. downloaded
- **ffmpeg** and **ffprobe** are vendored via npm (`ffmpeg-static`, `ffprobe-static`) — no manual install needed.
- **yt-dlp** is downloaded automatically the first time you use "Transcribe from Link" (or via Settings → yt-dlp → Download). It's saved to `resources/bin/yt-dlp/` and re-used after that. Instagram in particular changes frequently enough that yt-dlp itself may need occasional re-downloading if links stop working — use the same Settings button to fetch the latest build.
- **Transcription and all AI features** run through the Gemini API — there's no local model/binary to install for that.

## Music & SFX
Settings → "Music & SFX Library Folder" lets you point at your own royalty-free audio folder. A small bundled starter pack lives in `resources/music/` (add a few CC0 tracks there if you want zero-setup music suggestions — none are bundled by default, so the AI edit-plan step will simply skip music suggestions until you add some, whether via the starter pack folder or your own library folder).

## Building an installer
Not set up yet — this build targets `npm run dev` (dev mode) only. Packaging via `electron-builder` (a distributable `.exe`) is a follow-up step once the app itself has been used and validated.

## Known limitations (v1)
- The AI edit-plan step matches your script to asset files by **filename and duration only** — it cannot see actual video/image content. Name your asset files descriptively (e.g. `beach_walk_01.mp4`) for better matches.
- Subtitle timing without a transcribed voiceover asset is estimated from word count, not frame-accurate.
- Automated cut points are a starting point for the review timeline, not a final cut — expect to nudge trim points manually.
- Instagram scraping via yt-dlp is inherently fragile; expect occasional breakage.
