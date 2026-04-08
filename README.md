MacroCam 📸
An AI-powered food scanner and nutrition tracker built as a Progressive Web App — point your camera at any food, get instant calorie and macro breakdown, log meals to a diary, and track your daily health goals.
Built with: Vanilla JS + HTML/CSS | Gemini AI | Groq (Llama 3.3 70B) | Chart.js | Open Food Facts API | Netlify Functions | PWA
🔗 Live: macrocam.netlify.app

What It Does
Point your camera at any food — a banana, a plate of pasta, a packaged product — and MacroCam identifies it instantly using Google's Gemini AI. It returns full nutritional data including vitamins and minerals, lets you adjust portion size in any unit, logs meals to a personal diary, and gives you AI-generated health insights based on what you've eaten.

Tech Stack
LayerTechnologyCoreHTML, CSS, Vanilla JavaScriptAI / Food RecognitionGoogle Gemini API (gemini-2.5-flash) with 3-model fallbackText AI / Meal PlannerGroq API (llama-3.3-70b-versatile)Charts & GraphsChart.jsBarcode LookupOpen Food Facts APIBarcode ReadingNative BarcodeDetector API (Android Chrome)StoragelocalStorageBackend ProxyNetlify Serverless FunctionsDeploymentNetlify (GitHub CI/CD)App InstallPWA (manifest + service worker)

Project Structure
macrocam/
├── index.html              # All screens and layout
├── nutrisnap.js            # All app logic and API calls
├── style.css               # Styling and dark mode
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── icon.png                # App icon
├── server.js               # Local dev proxy (not deployed)
└── netlify/
    └── functions/
        ├── gemini.js       # Gemini API proxy
        └── groq.js         # Groq API proxy

Getting Started
Prerequisites

A modern browser (Chrome or Safari)
Node.js (for local server)
A Google Gemini API key from aistudio.google.com
A Groq API key from console.groq.com

1. Clone the project
bashgit clone https://github.com/Lembachar/macrocam.git
cd macrocam
2. Add your API keys to server.js
jsconst GROQ_KEY = 'your-groq-key-here';
const GEMINI_KEY = 'your-gemini-key-here';
3. Run locally
bashnode server.js
Then open http://localhost:8888 in your browser.
4. Deploy to Netlify

Push to GitHub — Netlify auto-deploys on every push
Add GEMINI_KEY and GROQ_KEY as environment variables in Netlify dashboard


Installing as a Mobile App
Android

Open macrocam.netlify.app in Chrome
Tap the "Add to Home Screen" banner or go to browser menu → Add to Home Screen
App installs with icon, opens fullscreen like a native app

iPhone

Open macrocam.netlify.app in Safari (must be Safari)
Tap the Share button → "Add to Home Screen" → Add


What's Been Built
Core Features ✅

Food scanner — take a photo or upload from gallery, Gemini identifies the food and returns full nutrition data including vitamins and minerals
Manual search — type any food name with live suggestions and Groq-powered lookup
Barcode scanner — scan packaged food barcodes using native BarcodeDetector API, data fetched from Open Food Facts
Portion size selector — adjust amount with unit conversion (g, kg, oz, lb, cup, tbsp, tsp), all nutrition values update live
Health score badge — rates each food as Great / Moderate / High in calories based on nutrition profile
Vitamins & minerals — real data from Gemini for simple foods; skipped for complex meals

Diary & Tracking ✅

Food diary — log every meal with category (breakfast, lunch, dinner, snack) and optional price
Calorie ring — animated circular progress showing daily goal completion
Weekly bar chart — 7-day calorie history with today highlighted
Macro summary — daily carbs, protein and fat totals
Meal search & filter — search logged meals, grouped by category
Clear all — remove all today's meals with confirmation modal
Confetti animation — triggers when daily calorie goal is reached 🎉

Insights ✅

Weekly calorie chart — bar chart showing calories per day for the last 7 days (Chart.js)
Today's macro doughnut chart — visual carbs/protein/fat split with legend
Weekly nutrition score — calculated score based on how close you stayed to your calorie goal each day
Daily AI insight — Groq generates a personalized nutrition tip based on what you ate today
Eating pattern detection — analyzes your diary to detect breakfast habits, biggest meal, snacking frequency, and calorie consistency

Meal Planner ✅

Set a calorie target with quick presets
Add optional ingredients and cuisine preference
Choose between meals only, shakes only, or both
Groq suggests 3 options with full recipes, exact ingredient quantities, and step-by-step instructions

Profile ✅

Body stats — name, age, gender, height (cm/ft), weight (kg/lb)
Goal setting — lose weight, maintain, or gain muscle
Activity level — sedentary to extremely active
Auto-calculated goals — daily calorie target (Mifflin-St Jeor formula), protein goal, BMI with label, ideal body weight (Devine formula)
Water tracker — personalized daily goal based on body weight, quick add buttons (+150/250/330/500ml)
Logging streak — counts consecutive days with logged meals 🔥
Saved foods — heart any food result to save it, quick re-log from Profile

Other ✅

Dark mode — full dark theme toggle, preference saved in localStorage
Protein distribution analyzer — shows how protein is spread across meal categories
Food budget tracker — set a daily budget, add price per meal, tracks daily spending
PWA — installable on Android and iPhone, works offline for cached screens
Multi-model fallback — Gemini 2.5 → 2.0 → 1.5 Flash, never dies on rate limits
Serverless proxy — API keys stored in Netlify environment variables, never exposed client-side


What's Coming Next

Step & activity counter — track steps and workouts, calculate calories burned
Progress Forecast — input daily routine, get a 4-week weight projection chart
Smart offline mode — automatically caches your most-used foods for offline use
Expanded streak system — milestones, badges, weekly streak goals
Spotify integration — link your account to play workout music from the app
Community features — profiles, progress updates, social reactions (v2)


API Usage
APIPurposeCostGoogle Gemini (gemini-2.5-flash)Food recognition, AI insightsFree tier — 500 req/dayGroq (llama-3.3-70b)Manual search, meal planner, insightsFree tier — 14,400 req/dayOpen Food FactsBarcode product lookupFree, unlimitedChart.jsDashboard chartsFree library

Notes

All user data stored in localStorage — diary, profile, favorites, water tracker, dark mode preference
Gemini and Groq responses cached where possible to reduce API calls
Image compression to 512px before sending to Gemini reduces quota usage significantly
Rate limit handling built in — shows countdown timer when Gemini quota is hit
API keys stored server-side in Netlify environment variables — never exposed in client code







<!--new ideas on the way--!>
<-->

add also community , like insta and tiktok , meaning the person has a profile with followers and so on , u can update ur progress and people can reat to ur posts
-> link spotify to start music 





Shipped a bunch of new features on MacroCam this week — and learned a lot doing it.

MacroCam is a PWA I'm building that uses AI to identify food from a photo and return full nutrition data instantly.

What's new:
→ AI food scanner powered by Gemini — point your camera, get calories, macros, and micronutrients in seconds
→ Meal planner that actually solves "what do I eat" — set a calorie target, pick a cuisine, choose meals only or shakes only, and get 3 AI-generated suggestions with full recipes and steps
→ Multi-model fallback architecture (Gemini 2.5 → 2.0 → 1.5) so the app never dies on rate limits
→ Serverless proxy via Netlify Functions to keep API keys off the client

The meal planner was the most satisfying to build — turns a daily frustration into a 10-second decision.

Still rough around the edges — bugs exist, UX has room to grow. If you try it and find something broken or have a suggestion, I genuinely want to hear it.

🔗 macrocam.netlify.app

#buildinpublic #webdev #javascript #AI #PWA