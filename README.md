# VisionCraft AI

AI image generation and automated Shorts studio built with React, Node.js and FFmpeg.

## Run locally

```bash
npm run install:all
npm run dev
```

- Client: http://localhost:5173
- API: http://localhost:5000/api/health

The image studio uses a configurable no-key endpoint for development. Add a production provider later through `server/.env`. Shorts are rendered locally with FFmpeg and include a custom watermark.

## Portfolio UI update
- Custom VisionCraft AI brand icon replaces the old globe/aperture icon.
- Click the profile block in the top-right and choose **Add profile photo**. The image is stored locally in the browser.
- Story video captions are disabled; only neural narration and watermark remain.
- Hindi text is detected automatically and uses `hi-IN-SwaraNeural`.
