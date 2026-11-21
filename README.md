# CraveLock (Kya Mangaye)

Fast 5-round adaptive dish decision engine for Indian metro food delivery with protein, gut digestion, and delivery durability intelligence.

Live Web App: [https://yugjain.github.io/crave-decider/](https://yugjain.github.io/crave-decider/)

## Why CraveLock Exists

When you are hungry at home in Mumbai, Bangalore, Delhi, Noida, Chennai, or Kolkata, you already know which kitchens you trust once you know what you feel like eating. The 25-to-40 minute bottleneck on delivery apps is deciding **which dish** to order right now.

CraveLock removes menu paralysis in under 20 seconds by combining hard dietary filtering with a 5-round sensory elimination tournament.

## Key Features

- **Strict Dietary & Delivery Filtering:** Supports `Pure Veg`, `Jain-Friendly` (with explicit Jain customization notes), `Veg + Egg`, and `Non-Veg` (saved in `localStorage`), plus 1-tap toggles for `High-Protein (24g+)` and `Travel-Safe Delivery Only` (excludes fragile items like crisp dosas or wood-fired pizzas that go soggy past 15 minutes).
- **113 Curated Dish Blueprints:** Complete cart meal combos (main + ideal bread/side/accompaniment) across South Indian Tiffin, North Indian & Tandoor, Biryani & Rice Bowls, Regional Indian Specialties, Desi Chinese & Pan-Asian, and Middle Eastern / Global High-Protein Bowls.
- **5-Round Adaptive Craving Funnel:** Rounds 1 to 4 narrow down Base Format, Flavour Axis, Texture, and Culinary Soul with live diet-compliant dish previews, followed by a Round 5 Head-to-Head Showdown between the top 2 surviving concrete dish blueprints.
- **Practical Post-Decision Intelligence:** Displays estimated protein grams, calorie bracket, late-night digestion friendliness, and delivery durability rating with packaging tips.
- **72-Hour Repeat Avoidance & Runner-Up Swap:** Locking in tonight's order deprioritizes that dish for 72 hours locally, and 1 tap swaps between close alternatives in the same craving pocket.
- **Zero-Bloat Architecture:** Built with native browser ES Modules and custom Warm Editorial CSS. Zero runtime dependencies and zero `node_modules` (under 150 KB total repo size).

## Prerequisites

- Any modern browser (to run locally or on GitHub Pages)
- Optional for local static server or running tests: Python 3 or Node.js v20+

## 3-Minute Quickstart

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yugjain/crave-decider.git
   cd crave-decider
   ```

2. **Serve locally (no `npm install` required):**
   ```bash
   python3 -m http.server 5173
   ```
   Or using Node:
   ```bash
   npx serve -l 5173
   ```

3. **Open in your browser:**
   Visit [http://localhost:5173](http://localhost:5173).

## Verification Suite

Run the exhaustive 1,024-permutation test suite covering every combination of Diet (4), Heaviness (4), High-Protein (2), Travel-Safe (2), and Sensory Paths (16):

```bash
node tests/verify-engine.mjs
```

## Project Structure

```text
crave-decider/
├── index.html                  # App shell and Google Fonts setup
├── README.md                   # Documentation and quickstart
├── src/
│   ├── app.js                  # Interactive UI state, keyboard shortcuts, localStorage persistence
│   ├── data/
│   │   └── dishes.js           # 113 curated Indian metro dish blueprints
│   ├── engine/
│   │   └── decisionEngine.js   # Filtering, weighted scoring, and adaptive round builder
│   └── styles/
│       └── editorial.css       # Warm Editorial Food Club dark theme
└── tests/
    └── verify-engine.mjs       # Exhaustive 1,024-permutation integrity and compliance test
```

## Troubleshooting / FAQ

- **Why do some dishes not show up when "Travel-Safe Delivery Only" is on?**
  Dishes like Davangere Benne Dosa, Rava Onion Dosa, Chole Bhature, and Neapolitan Pizza are tagged `Fragile (<15m Nearby)` because steam inside delivery boxes ruins their crust beyond 15 minutes. Toggle off `Travel-Safe Only` if ordering from a nearby kitchen within 2.5 km.
- **How do I reset the 72-hour cooldown history?**
  Click the `72h Cooldown` button in the top-right navigation bar to inspect, remove individual dishes, or clear your recent order history.
