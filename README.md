<h1 align="center">MacroCam</h1>

<p align="center">
  <b>Point your camera at any food and get calories, macros and micronutrients in seconds.</b><br>
  An AI-powered food scanner and nutrition tracker, built as an installable Progressive Web App.
</p>

<p align="center">
  <a href="https://macrocam.netlify.app"><img alt="Live demo" src="https://img.shields.io/badge/Live_demo-macrocam.netlify.app-22c55e?style=for-the-badge&logo=netlify&logoColor=white"></a>
</p>

<p align="center">
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-vanilla-f7df1e?style=flat-square&logo=javascript&logoColor=black">
  <img alt="Gemini" src="https://img.shields.io/badge/Google_Gemini-vision-4285f4?style=flat-square&logo=googlegemini&logoColor=white">
  <img alt="Groq" src="https://img.shields.io/badge/Groq-Llama_3.3_70B-f55036?style=flat-square">
  <img alt="Chart.js" src="https://img.shields.io/badge/Chart.js-4-ff6384?style=flat-square&logo=chartdotjs&logoColor=white">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-installable-5a0fc8?style=flat-square&logo=pwa&logoColor=white">
  <img alt="Lighthouse" src="https://img.shields.io/badge/Lighthouse-97_·_95_·_100_·_100-0cce6b?style=flat-square&logo=lighthouse&logoColor=white">
</p>

<p align="center">
  <img src="docs/scan.png" alt="MacroCam scan screen" width="300">
  &nbsp;&nbsp;
  <img src="docs/meal-planner.png" alt="MacroCam AI meal planner" width="300">
</p>

---

## Highlights

- **41+ users in 10+ countries** since launch.
- **Lighthouse 97 / 95 / 100 / 100** (performance, accessibility, best practices, SEO).
- **Resilient AI calls:** Gemini 2.5 → 2.0 → 1.5 Flash fallback chain, with a countdown when the quota is hit.
- **No exposed keys:** every AI request goes through Netlify serverless functions; keys live only in environment variables.
- **Cheaper requests:** photos are compressed to 512 px before upload, and responses are cached where possible.

## Features

| Area | What it does |
|---|---|
| **Scan** | Photo or gallery upload → Gemini identifies the food and returns full nutrition, including vitamins and minerals. Barcode scanning (native `BarcodeDetector`) pulls packaged products from Open Food Facts. |
| **Search** | Type any food, with live suggestions and Groq-powered lookup. Portion selector with unit conversion (g, kg, oz, lb, cup, tbsp, tsp). |
| **Diary** | Log meals by category with optional price. Animated calorie ring, macro totals, meal search, and confetti when you hit your goal. |
| **Insights** | 7-day calorie chart, macro doughnut, weekly nutrition score, a daily AI tip, and eating-pattern detection (breakfast habits, biggest meal, snacking). |
| **Meal planner** | Set a calorie target, ingredients and cuisine; Groq returns three recipes with exact quantities and steps. |
| **Profile** | Calorie target (Mifflin-St Jeor), protein goal, BMI, ideal weight (Devine), water tracker, logging streak, saved foods, food budget, dark mode. |

## Architecture

```
Browser (PWA: index.html · macrocam.js · style.css · sw.js)
   │  photo / text / barcode
   ├──► /.netlify/functions/gemini   ──► Google Gemini API  (vision, insights)
   ├──► /.netlify/functions/groq     ──► Groq API           (search, meal planner, tips)
   ├──► /.netlify/functions/logmeal  ──► LogMeal API        (meal segmentation, nutrition)
   └──► Open Food Facts API                                  (barcode lookup)
State: localStorage (diary, profile, favourites, water, theme)
```

## Run locally

Prerequisites: Node.js, the [Netlify CLI](https://docs.netlify.com/cli/get-started/), a [Gemini API key](https://aistudio.google.com), a [Groq API key](https://console.groq.com) and, optionally, a [LogMeal](https://logmeal.com) key.

```bash
git clone https://github.com/Lembachar/macrocam.git
cd macrocam
netlify env:set GEMINI_KEY your-gemini-key
netlify env:set GROQ_KEY your-groq-key
netlify env:set LOGMEAL_KEY your-logmeal-key
netlify dev        # serves the app and functions on http://localhost:8888
```

Deploying: push to GitHub, and Netlify builds on every push. Set the same three keys in the Netlify dashboard.

## Install on your phone

- **Android (Chrome):** open [macrocam.netlify.app](https://macrocam.netlify.app) → menu → *Add to Home screen*.
- **iPhone (Safari):** open the site → Share → *Add to Home Screen*.

## Roadmap

- Step and workout tracking with calories burned
- 4-week weight forecast from your daily routine
- Smarter offline mode that caches your most-used foods
- Streak milestones and badges
- Community profiles and progress posts

---

<p align="center"><sub>Built by <a href="https://github.com/Lembachar">Imad Lembachar</a></sub></p>
