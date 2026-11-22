# 🪴 Plant Daddy

A small, playful web app to keep your plants alive. Open it and it tells you what needs doing today.

## What it does

- **Today list.** Water, feed, rotate, photo check-ins and repot checks, worked out from each plant's schedule and what you've already logged. Tap ✓ when it's done. If the soil is still damp, tap "not yet" and it comes back in 2 days.
- **Plant cards with moods.** 😊 happy, 🙂 thirsty soon, 🥵 thirsty.
- **Plant profiles.** Room, which way the window faces, distance from it, light level, pot size, drainage, last repot date, notes.
- **Photo timeline** so you can see growth or decline over time.
- **Care log** of everything you've done.
- **Ask Claude.** Sends the plant's details, recent care log and latest photo to Claude (via the phone's share sheet, or copy/paste). Claude ends its reply with schedule lines. Paste the reply back in and the app updates the schedule. This works with your normal Claude plan; there's no API key and nothing to pay for.
- **Backup / restore** to a JSON file, which is also how you move your data to another device.

All data stays on the device, in the browser's storage. There's no server and no account.

## Run it on your computer

It's plain HTML/CSS/JS with no build step. From this folder:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Put it on your phone

The app has to be served over HTTPS for the phone to install it. The easiest free option is **GitHub Pages**:

1. Create a new GitHub repo (e.g. `plant-daddy`) and push this folder to it.
2. In the repo, go to **Settings → Pages → Deploy from branch → main / root**.
3. Open the URL it gives you (like `https://<you>.github.io/plant-daddy/`) on your phone.
4. iPhone: Safari → Share → **Add to Home Screen**. Android: Chrome → ⋮ → **Install app**.

Your plant data lives on the phone, not on GitHub. The repo only holds the app code.

## Files

| File | What it is |
|---|---|
| `index.html` | App shell and bottom nav |
| `styles.css` | Warm, minimal, playful look |
| `app.js` | Screens: Today, Plants, plant detail, add/edit, settings |
| `care.js` | Species starting points, due-date math, moods, Claude prompt and reply parser |
| `db.js` | IndexedDB storage for plants, logs and photos |
| `sw.js` | Offline support. Bump `VERSION` after changing files |
| `manifest.webmanifest`, `icons/` | Home-screen install |

## Ideas for v2

- Shared plants with Charli (needs a small sync backend)
- Fertilizer season (pause feeding Nov–Feb automatically)
- Per-plant "thirst meter" that learns from how often you snooze watering
