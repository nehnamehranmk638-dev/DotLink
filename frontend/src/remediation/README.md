# DotLink Remediation Mini-Games Module (`src/remediation/`)

An adaptive, trauma-informed learning aid for children ages 6–8 with ADHD, executive function challenges, or rejection sensitivity dysphoria (RSD), designed for Class 1–2 math.

---

## 🎯 Purpose & Philosophy

When a child has failed a check-in question twice, they often experience heightened anxiety and frustration. This module intervenes immediately with an interactive, animated mini-game that:
1. **Teaches the underlying method gently** through concrete step ordering or face-up number matching.
2. **Never tests the child again** inside the game.
3. **Is impossible to fail**: Every interaction provides positive scaffolding.
4. **Auto-assists after 2 missteps**: After 2 misplacements or mismatches, the next correct action is highlighted with a pulse and smoothly placed (`assisted: true`).
5. **Soft 30-Second Internal Cap**: If the child stalls or reaches the 28–30s cap, the game gently auto-finishes with positive encouragement so the child never experiences defeat.
6. **No Red, No X Marks, No Buzzers**: All feedback uses warm, constructive language ("Almost", "Let's try this one", "Nice!").

---

## 📦 Component Contract

```jsx
import { RemediationGame } from './remediation';

<RemediationGame
  config={config}
  onComplete={handleComplete}
  reduceMotion={false}  // Optional app-level toggle (honors prefers-reduced-motion by default)
  soundEnabled={false}  // Optional (OFF by default; text always carries full meaning)
/>
```

### Config Schema

```ts
interface RemediationConfig {
  gameType: "order_steps" | "match_pairs";
  theme: "dinosaurs" | "space" | "cars" | "animals" | "football" | "drawing";
  companion: { key: string; name: string };
  problem: { a: number; b: number; op: "+" | "-" };
  objectKey: string;   // e.g. "dino_egg", "rocket", "wheel", "animal_paw", "football", "pencil"
  steps?: Array<{
    id: string;
    label: string;
    iconKey: string;
    animation?: any;
  }>; // order_steps: in CORRECT order (shuffled automatically on load)
  pairs?: Array<{
    id: string;
    left: { type: "numeral"; value: number };
    right: { type: "objects"; objectKey: string; count: number };
  }>; // match_pairs: face-up matching pairs
  voiceLines: {
    intro: string;
    hint: string;
    assist: string;
    success: string;
  };
}
```

### `onComplete` Payload

```ts
onComplete({
  gameType: "order_steps" | "match_pairs",
  assisted: boolean,      // true if auto-assist or stall finish triggered
  interactions: number,  // total taps/drags
  misplacements: number, // count of wrong placements/matches
  durationMs: number     // duration in milliseconds
});
```
> **Important:** This payload is strictly for telemetry logging; **never display it to the child**.

---

## 🪝 Hook: `useRemediationFlow`

Provides turnkey integration for host question / check-in components:

```jsx
import { useRemediationFlow } from './remediation';

function QuestionCard() {
  const {
    triggerRemediation,
    isAhaRevealing,
    highlightedId,
    ahaCompanionLine,
    RemediationPopup
  } = useRemediationFlow({
    reduceMotion: false,
    soundEnabled: false,
    onFlowComplete: () => {
      // Called after 3-second "Aha" reveal completes
    }
  });

  // When check-in API returns:
  // { result: "breakdown", remediation: config, highlightOptionId: "opt-2" }
  const handleCheckInResponse = (apiResponse) => {
    triggerRemediation(apiResponse, () => {
      // Continue quiz or next question
    });
  };

  return (
    <div>
      {/* Question UI with glowing highlightOptionId when isAhaRevealing is true */}
      <RemediationPopup />
    </div>
  );
}
```

### 3-Second "Aha" Reveal:
When the mini-game completes:
1. Telemetry is posted silently to `/api/remediation/log` via `submitRemediationLog(payload)`.
2. The popup dismisses.
3. The host question highlights the correct option (`highlightOptionId`) with a soft glowing ring and companion line: *"Aha! Look here! Now you know the secret steps!"*.
4. Automatically transitions after 3 seconds so the child proceeds seamlessly.

---

## 🎮 Built-in Games

### Game 1: "Companion's Secret Steps" (`order_steps`) — DEFAULT
- **Concept:** Three large picture cards shown shuffled. Three numbered slots (1, 2, 3).
- **Dual Interactions:** Supports **pointer drag-and-drop** AND **tap-card-then-tap-slot** (touch & mouse).
- **Scaffolding:** 1st misplacement floats back with positive hint; 2nd misplacement triggers pulse & auto-placement.
- **Demonstration:** Once all 3 cards are placed, plays an animated demonstration using the child's actual problem numbers ($a \pm b = \text{total}$), counting objects with gentle pops and a total badge.

### Game 2: "Match the Numbers" (`match_pairs`)
- **Concept:** 3 pairs shown simultaneously face-up: numerals on the left, groups of themed objects on the right.
- **Working-Memory Friendly:** Nothing is hidden or flipped.
- **Interactive Connections:** Tapping matches draws a soft dashed SVG connector line and creates a soft glow.
- **Calm Celebration:** 1-second calm celebration before completing.

---

## 🚀 How to Add a 3rd Game (e.g. "Sort the Basket")

The module uses an open **Game Registry** (`gameRegistry.js`). To add a new game:

### Step 1: Create your game component (`SortTheBasketGame.jsx`)
Adhere to the standard game contract props:
```jsx
export default function SortTheBasketGame({
  config,
  onComplete,
  reduceMotion,
  soundEnabled
}) {
  // Implement game logic...
  // When finished:
  onComplete({
    gameType: 'sort_the_basket',
    assisted: false,
    interactions: 5,
    misplacements: 0,
    durationMs: 22000
  });
}
```

### Step 2: Register it in `gameRegistry.js`
```javascript
import SortTheBasketGame from './SortTheBasketGame';
import { registerGame } from './gameRegistry';

registerGame('sort_the_basket', SortTheBasketGame);
```

### Step 3: Use it in configs
```javascript
const config = {
  gameType: 'sort_the_basket',
  theme: 'animals',
  // ...
};
```
No existing game or hook code needs to be modified!

---

## 🧪 Dev Lab & Automated Tests

### Interactive Dev Lab
Visit `/dev/remediation` in your browser to:
- Test all 6 pre-built mock configs.
- Toggle between `order_steps` and `match_pairs`.
- Switch themes (`dinosaurs`, `space`, `cars`, `animals`, `football`, `drawing`).
- Change math operations ($+$ / $-$) and operands ($1$ to $9$).
- Test Reduce Motion and Web Audio / Speech Synthesis sound toggles.
- Test the **"Simulate Stalling / Soft Cap"** button.
- Inspect the live `onComplete` telemetry payload JSON.

### Running Automated Tests
```bash
npm test
```
Runs 19 automated unit & integration tests across:
- `orderStepsReducer.test.js` (initialization, card selection, correct placement, positive misplacement, auto-assist, stall cap)
- `matchPairsReducer.test.js` (face-up pairs, matching, mismatches, auto-assist, stall cap)
- `remediation.test.jsx` (modal accessibility, tap-to-place, auto-assist DOM checks, reduced-motion paths, silent telemetry logging)
