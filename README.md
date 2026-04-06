Bitesize 🥗
An AI-powered food scanner and nutrition tracker built as a Progressive Web App — scan any food with your camera, get instant calorie and macro breakdown, log meals to a diary, and track your daily health goals.

Built with Vanilla JS + HTML/CSS | Gemini AI | Three.js | Chart.js | Open Food Facts API | PWA


What It Does
Point your camera at any food — a banana, a plate of pasta, a packaged product — and Bitesize identifies it instantly using Google's Gemini AI. It returns full nutritional data, lets you adjust portion size in any unit, logs meals to a personal diary, and gives you AI-generated health insights based on what you've eaten.

Tech Stack
LayerTechnologyCoreHTML, CSS, Vanilla JavaScriptAI / RecognitionGoogle Gemini API (gemini-2.5-flash)3D VisualizationThree.jsCharts & GraphsChart.jsBarcode LookupOpen Food Facts APIBarcode ReadingQuagga.jsStoragelocalStorageDeploymentNetlifyApp InstallPWA (manifest + service worker)

Project Structure
bitesize/
├── index.html       # All screens and layout
├── nutrisnap.js     # All app logic and API calls
├── style.css        # Styling and dark mode
├── manifest.json    # PWA manifest
├── sw.js            # Service worker
└── icon.png         # App icon

Getting Started
Prerequisites

A modern browser (Chrome or Safari)
Node.js (for local server)
A Google Gemini API key from aistudio.google.com

1. Clone or download the project
bashgit clone https://github.com/Lembachar/bitesize.git
cd bitesize
2. Add your API key
Open nutrisnap.js and replace the key at the top:
jsconst GEMINI_KEY = 'your-gemini-api-key-here';
3. Run locally
bashnpx serve .
Then open http://localhost:3000 in your browser.
4. Deploy
Drag the project folder to app.netlify.com/drop for instant deployment.

Installing as a Mobile App
Android

Open the deployed URL in Chrome
Tap the "Add to Home Screen" banner or go to browser menu → Add to Home Screen
App installs with icon, opens fullscreen like a native app

iPhone

Open the deployed URL in Safari (must be Safari)
Tap the Share button (square with arrow)
Tap "Add to Home Screen" → Add


What's Been Built
Core Features ✅

Food scanner — take a photo or upload from gallery, Gemini identifies the food and returns full nutrition data
Manual search — type any food name with live suggestions and Gemini-powered lookup
Barcode scanner — scan packaged food barcodes using Quagga.js, data fetched from Open Food Facts API
Portion size selector — adjust amount with unit conversion (g, kg, oz, lb, cup, tbsp, tsp), all nutrition values update live
3D visualization — Three.js animated sphere with orbiting rings representing macros, color-coded by health score
Health score badge — rates each food as Great / Moderate / High in calories based on nutrition profile

Diary & Tracking ✅

Food diary — log every meal with category (breakfast, lunch, dinner, snack) and optional price
Calorie ring — animated circular progress showing daily goal completion
Weekly bar chart — 7-day calorie history with today highlighted
Macro summary — daily carbs, protein and fat totals
Meal search & filter — search logged meals, group by category
Clear all — remove all today's meals with confirmation modal
Confetti animation — triggers when daily calorie goal is reached 🎉

Dashboard ✅

Weekly calorie chart — bar chart showing calories per day for the last 7 days (Chart.js)
Today's macro doughnut chart — visual carbs/protein/fat split with legend
Weekly nutrition score — calculated score based on how close you stayed to your calorie goal each day

AI Features ✅

Daily AI insight — Gemini generates a personalized nutrition tip based on what you ate today
Eating pattern detection — analyzes your diary to detect breakfast habits, biggest meal, snacking frequency, and calorie consistency
Meal planner — set a calorie target, add optional ingredients and cuisine preference, Gemini suggests 2 meals + 1 shake combination with full recipes and steps

Profile ✅

Body stats — name, age, gender, height (cm/ft), weight (kg/lb)
Goal setting — lose weight, maintain, or gain muscle
Activity level — sedentary to extremely active
Auto-calculated goals — daily calorie target (Mifflin-St Jeor formula), protein goal, BMI with label, ideal body weight (Devine formula)
Water tracker — personalized daily goal based on body weight, quick add buttons (+150/250/330/500ml)
Logging streak — counts consecutive days with logged meals 🔥

Other ✅

Favorites — heart any food result to save it, quick re-log from Saved tab
Dark mode — full dark theme toggle, preference saved in localStorage
Protein distribution analyzer — shows how protein is spread across meal categories
Food budget tracker — set a daily budget, add price per meal, tracks daily spending
PWA — installable on Android and iPhone, works offline for cached screens


What's Coming Next
Saved Ideas & Planned Features

Step & activity counter — track steps and activity level, calculate calories burned, subtract from daily remaining budget
Offline nutrition mode — built-in database of ~50 common foods that works without internet or API
Nav bar reorganization — current nav has too many items, needs cleaner structure (possibly tabbed groups or a hamburger overflow)
Expanded streak system — milestones, badges, weekly streak goals
Nutrition score dashboard — dedicated screen with detailed weekly and monthly scoring breakdown


API Usage
APIPurposeCostGoogle Gemini (gemini-2.5-flash)Food recognition, manual search, AI insights, meal suggestionsFree tier — 15 RPMOpen Food FactsBarcode product lookupFree, unlimitedQuagga.jsCamera barcode readingFree libraryChart.jsDashboard chartsFree libraryThree.js3D macro visualizationFree library

⚠️ The Gemini API key is currently embedded in the client-side JS file. For production, move it behind a backend proxy to prevent exposure.


Notes

The app uses localStorage for all data — diary, profile, favorites, water tracker, dark mode preference
Gemini responses are cached where possible to reduce API calls
Image compression to 512px before sending to Gemini reduces quota usage significantly
Rate limit handling built in — shows countdown timer when quota is hit