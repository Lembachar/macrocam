
const CALORIE_GOAL = 1800;
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:8888' : 'https://macrocam.netlify.app';
const getCalGoal = () => window.DYNAMIC_CALORIE_GOAL || CALORIE_GOAL;

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

async function callGemini(body) {
  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(`${API_BASE}/.netlify/functions/gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, payload: body })
      });
      const text = await res.text();
      if (!text || !text.trim()) continue;
      const data = JSON.parse(text);
      if (data.error?.code === 429 || data.error?.code >= 500) continue;
      return data;
    } catch(e) {
      continue;
    }
  }
  return { error: { code: 429, message: 'All models rate limited' } };
}


async function callGroq(messages, maxTokens = 1024) {
  try {
    const res = await fetch(`${API_BASE}/.netlify/functions/groq`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.1,
        max_tokens: maxTokens
      })
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  } catch(e) {
    return '';
  }
}



async function callLogMeal(base64Image) {
  try {
    const res = await fetch(`${API_BASE}/.netlify/functions/logmeal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64Image })
    });
    const data = await res.json();
    if (data.error) return null;

    const nutri = data.nutriData;
    const seg = data.segData;

    // Extract food name from segmentation result
    const name = seg?.foodName ||
      seg?.segmentation_results?.[0]?.recognition_results?.[0]?.name ||
      'Food';

    // Extract nutrition values
    const n = nutri?.nutritional_info || {};
    return {
      name,
      calories:  Math.round(n.calories   ?? 0),
      carbs:     Math.round(n.totalCarbs  ?? n.carbohydrates ?? 0),
      protein:   Math.round(n.protein     ?? 0),
      fat:       Math.round(n.totalFat    ?? n.fat ?? 0),
      fiber:     Math.round(n.dietaryFiber ?? n.fiber ?? 0),
      sugar:     Math.round(n.totalSugars  ?? n.sugar ?? 0),
      serving:   '1 serving',
      estimatedGrams: Math.round(n.weight ?? 0),
      ingredients: [],
      vitaminC: -1, iron: -1, calcium: -1, potassium: -1
    };
  } catch(e) {
    return null;
  }
}





let currentFood = null;
let imageBase64 = null;
let imageFile = null;
let diary = JSON.parse(localStorage.getItem('nutrisnap_diary') || '[]');
const getToday = () => new Date().toDateString();


document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
document.getElementById('diary-date-sub').textContent = 'Today — ' + new Date().toLocaleDateString('en-US', { month:'long', day:'numeric' });


function switchTab(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('screen-' + el.dataset.screen).classList.add('active');
  if (el.dataset.screen === 'diary') { renderDiary(); loadDiaryLocation(); }
  if (el.dataset.screen === 'insights') { renderDashboard(); loadDeviceInfo(); loadAIInsight(); analyzeEatingPatterns(); }
  if (el.dataset.screen === 'profile')   loadProfile();
  if (el.dataset.screen === 'meal') { lastMealSuggestions = null; }
  if (el.dataset.screen !== 'scan') { stopBarcodeScanner(); document.getElementById('barcode-section').style.display = 'none'; document.getElementById('barcode-toggle-btn').innerHTML = '<i class="fa-solid fa-barcode"></i> Scan barcode'; }

}

function showResultScreen() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-result').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
}

function goBackToScan() {
  const preview = document.getElementById('cam-preview');
  preview.src = '';
  preview.classList.remove('show');
  document.getElementById('cam-overlay').classList.remove('hidden');
  document.getElementById('analyze-btn').disabled = true;
  document.getElementById('analyze-btn').textContent = 'Analyze food';
  document.getElementById('camera-input').value = '';
  document.getElementById('gallery-input').value = '';
  imageBase64 = null;
  imageFile = null;
  switchTab(document.querySelector('[data-screen="scan"]'));
}



function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}


function compressImage(file, maxSize = 512) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize; } }
        else        { if (h > maxSize) { w = w * maxSize / h; h = maxSize; } }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.8);
        resolve(compressed);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}


async function handleImageFile(file) {
  if (!file) return;
  imageFile = file;
  document.getElementById('status-bar').classList.add('show');
  document.getElementById('status-txt').textContent = 'Compressing image…';
  const compressed = await compressImage(file, 512);
  imageBase64 = compressed.split(',')[1];
  const preview = document.getElementById('cam-preview');
  preview.src = compressed;
  preview.classList.add('show');
  document.getElementById('cam-overlay').classList.add('hidden');
  document.getElementById('analyze-btn').disabled = false;
  document.getElementById('status-bar').classList.remove('show');
}

document.getElementById('camera-input').addEventListener('change', e => handleImageFile(e.target.files[0]));
document.getElementById('gallery-input').addEventListener('change', e => handleImageFile(e.target.files[0]));

// ═══════════════════════════════
// RATE LIMIT HELPER
// ═══════════════════════════════
let rateLimitUntil = 0;
let countdown = null;

function startCooldown(seconds) {
  rateLimitUntil = Date.now() + seconds * 1000;
  const btn = document.getElementById('analyze-btn');
  if (countdown) clearInterval(countdown);
  countdown = setInterval(() => {
    const left = Math.ceil((rateLimitUntil - Date.now()) / 1000);
    if (left <= 0) {
      clearInterval(countdown);
      btn.disabled = false;
      btn.textContent = 'Analyze food';
    } else {
      btn.disabled = true;
      btn.textContent = `Wait ${left}s…`;
    }
  }, 500);
}

// ═══════════════════════════════
// ANALYZE — GEMINI API
// ═══════════════════════════════
document.getElementById('analyze-btn').addEventListener('click', analyzeFood);

async function analyzeFood() {
  if (!imageBase64) return;
  if (Date.now() < rateLimitUntil) return;

  document.getElementById('analyze-btn').disabled = true;
  document.getElementById('status-bar').classList.add('show');
  document.getElementById('scan-line').classList.add('show');
  document.getElementById('status-txt').textContent = 'Analyzing food…';

  try {
    const prompt = `You are a nutrition expert analyzing a food photo. Estimate the portion size you see in the image and return ONLY this JSON with no extra text:\n{\"name\":\"\",\"calories\":0,\"carbs\":0,\"protein\":0,\"fat\":0,\"fiber\":0,\"sugar\":0,\"serving\":\"\",\"estimatedGrams\":0,\"ingredients\":[],\"vitaminC\":0,\"iron\":0,\"calcium\":0,\"potassium\":0}\nRules:\n- Estimate the actual portion visible in the photo (e.g. 1 apple ≈ 180g, a plate of rice ≈ 250g)\n- All nutrition values must be for the ESTIMATED portion shown, not per 100g\n- Set estimatedGrams to your best weight estimate in grams\n- For serving write a human description e.g. \"1 medium apple\" or \"1 plate of rice\"\n- Numbers only, no units in values\n- For ingredients list main components e.g. [\"chicken\",\"rice\",\"tomato\"]\n- For vitaminC, iron, calcium, potassium provide values in mg for the estimated portion\n- If complex meal with more than 3 ingredients set vitaminC, iron, calcium, potassium all to -1`;

    const data = await callGemini({
      contents: [{
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
    });
    
    

    // if Gemini failed, try LogMeal as fallback
    if (data.error) {
      document.getElementById('status-txt').textContent = 'Trying backup recognition…';
      const logmealResult = await callLogMeal(imageBase64);
      if (logmealResult) {
        currentFood = logmealResult;
        document.getElementById('status-bar').classList.remove('show');
        document.getElementById('scan-line').classList.remove('show');
        document.getElementById('analyze-btn').textContent = 'Analyze food';
        showResult(currentFood);
        insightLoaded = false;
        incrementScanCounter();
        const lastBtn = document.getElementById('last-result-btn');
        if (lastBtn) lastBtn.style.display = 'block';
        showResultScreen();
        return;
      }
      // LogMeal also failed
      if (data.error?.code === 429) {
        const retryAfter = data.error?.details?.find(d => d.retryDelay)?.retryDelay;
        const secs = retryAfter ? parseInt(retryAfter) : 60;
        document.getElementById('status-bar').classList.remove('show');
        document.getElementById('scan-line').classList.remove('show');
        showToast(`Rate limited — please wait ${secs}s`);
        startCooldown(secs);
        return;
      }
      throw new Error('API error: ' + data.error.message);
    }


    

    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Raw text:', raw);

    // auto-retry once if response is empty
    if (!raw.trim()) {
      document.getElementById('status-txt').textContent = 'Retrying…';
      const retryData = await callGemini({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
            { text: prompt }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
      });
      raw = retryData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!raw.trim()) throw new Error('Empty response after retry');
    }

    // robust JSON extraction — handles truncated responses too
    let jsonStr = '';
    const match = raw.match(/\{[\s\S]*/);
    if (!match) throw new Error('No JSON found. Raw: ' + raw);
    jsonStr = match[0];

    // if truncated (no closing brace), try to repair it
    if (!jsonStr.includes('}')) {
      jsonStr += ',"fiber":2,"sugar":5,"serving":"1 serving"}';
    } else if ((jsonStr.match(/\{/g)||[]).length > (jsonStr.match(/\}/g)||[]).length) {
      jsonStr += '}'; // add missing closing brace
    }

    try {
      currentFood = JSON.parse(jsonStr);
    } catch(parseErr) {
      // ask Groq to repair the broken JSON
      document.getElementById('status-txt').textContent = 'Repairing response…';
      try {
        const repaired = await callGroq([{
          role: 'user',
          content: `The following is a broken JSON nutrition object. Fix it and return ONLY valid JSON, no extra text:\n${jsonStr}`
        }], 512);
        const repairedText = repaired?.choices?.[0]?.message?.content || '';
        const repairedMatch = repairedText.match(/\{[\s\S]*\}/);
        if (!repairedMatch) throw new Error('Groq could not repair JSON');
        currentFood = JSON.parse(repairedMatch[0]);
      } catch(repairErr) {
        throw new Error('Could not parse nutrition data even after repair');
      }
    }

    document.getElementById('status-bar').classList.remove('show');
    document.getElementById('scan-line').classList.remove('show');
    document.getElementById('analyze-btn').textContent = 'Analyze food';

    showResult(currentFood);
    insightLoaded = false;
    incrementScanCounter();
    const lastBtn = document.getElementById('last-result-btn');
    if (lastBtn) lastBtn.style.display = 'block';
    showResultScreen();

  } catch(err) {
    document.getElementById('status-bar').classList.remove('show');
    document.getElementById('scan-line').classList.remove('show');
    document.getElementById('analyze-btn').disabled = false;
    document.getElementById('analyze-btn').textContent = 'Analyze food';
    showToast('Error: ' + (err.message || 'Try again'));
    console.error('Gemini error:', err);
  }
}

// ═══════════════════════════════
// PORTION — UNIT BASED
// ═══════════════════════════════
// All nutrition data from Gemini is per 100g baseline
// We convert user's chosen amount+unit to grams, then multiply
let portionMultiplier = 1;
let selectedUnit = 'g';
let portionAmountG = 100; // grams equivalent

const UNIT_TO_G = {
  g:    1,
  kg:   1000,
  oz:   28.3495,
  lb:   453.592,
  cup:  240,
  tbsp: 15,
  tsp:  5
};

function selectUnit(btn) {
  document.querySelectorAll('.unit-btn[data-unit]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedUnit = btn.dataset.unit;
  // set sensible defaults per unit
  const defaults = { g:100, kg:0.1, oz:3.5, lb:0.22, cup:1, tbsp:2, tsp:3 };
  document.getElementById('portion-amount').value = defaults[selectedUnit] || 100;
  onPortionChange();
}

function adjustAmount(delta) {
  const input = document.getElementById('portion-amount');
  const step = selectedUnit === 'kg' || selectedUnit === 'lb' ? 0.1 : (selectedUnit === 'tsp' || selectedUnit === 'tbsp' ? 0.5 : 10);
  input.value = Math.max(0.1, Math.round((parseFloat(input.value || 0) + delta * step) * 10) / 10);
  onPortionChange();
}

function onPortionChange() {
  const amount = parseFloat(document.getElementById('portion-amount').value) || 100;
  portionAmountG = amount * (UNIT_TO_G[selectedUnit] || 1);
  portionMultiplier = portionAmountG / 100; // baseline is 100g

  // show converted weight
  const convEl = document.getElementById('portion-converted');
  if (convEl) {
    if (selectedUnit === 'g') convEl.textContent = portionAmountG.toFixed(0) + 'g';
    else convEl.textContent = portionAmountG.toFixed(0) + 'g equivalent';
  }

  if (currentFood) showResult(currentFood, false);
}

// ═══════════════════════════════
// HEALTH SCORE
// ═══════════════════════════════
function getHealthScore(food) {
  let score = 100;
  const cal = food.calories || 0;
  const protein = food.protein || 0;
  const fiber = food.fiber || 0;
  const sugar = food.sugar || 0;
  const fat = food.fat || 0;

  if (cal > 600) score -= 30;
  else if (cal > 400) score -= 15;
  if (sugar > 20) score -= 20;
  else if (sugar > 10) score -= 10;
  if (fat > 20) score -= 15;
  if (protein > 15) score += 10;
  if (fiber > 5) score += 10;

  score = Math.max(20, Math.min(100, score));

  if (score >= 70) return { score, label: '✦ Great choice', cls: 'great', color: 0x3B6D11 };
  if (score >= 45) return { score, label: '◈ Moderate', cls: 'good', color: 0xb7770d };
  return { score, label: '⚠ High in calories', cls: 'ok', color: 0xb94a00 };
}

// ═══════════════════════════════
// SHOW RESULT
// ═══════════════════════════════
function showResult(food, resetPortion = true) {
  // hide portion selector for camera scans, show for manual/barcode/favorites
  const portionSelector = document.getElementById('portion-selector');
  if (portionSelector) {
    portionSelector.style.display = imageBase64 ? 'none' : 'flex';
  }

  if (resetPortion) {
    const estimated = food.estimatedGrams || 100;
    portionAmountG = estimated;
    portionMultiplier = 1;
    selectedUnit = 'g';
    const amountEl = document.getElementById('portion-amount');
    if (amountEl) amountEl.value = estimated;
    document.querySelectorAll('.unit-btn[data-unit]').forEach(b => b.classList.toggle('active', b.dataset.unit === 'g'));
    const convEl = document.getElementById('portion-converted');
    if (convEl) convEl.textContent = estimated + 'g';
  }

  document.getElementById('empty-result').style.display = 'none';
  const card = document.getElementById('result-card');
  card.style.display = 'flex';

  const p = portionMultiplier;
  const cal    = Math.round((food.calories || 0) * p);
  const carbs  = Math.round((food.carbs || 0) * p * 10) / 10;
  const protein= Math.round((food.protein || 0) * p * 10) / 10;
  const fat    = Math.round((food.fat || 0) * p * 10) / 10;
  const fiber  = Math.round((food.fiber || 0) * p * 10) / 10;
  const sugar  = Math.round((food.sugar || 0) * p * 10) / 10;

  document.getElementById('food-name-el').textContent = food.name;
  document.getElementById('m-carbs').textContent   = carbs + 'g';
  document.getElementById('m-protein').textContent = protein + 'g';
  document.getElementById('m-fat').textContent     = fat + 'g';
  document.getElementById('m-fiber').textContent   = fiber + 'g';
  document.getElementById('m-sugar').textContent   = sugar + 'g';

  // calorie counter animation
  const kcalEl = document.getElementById('food-kcal-el');
  if (resetPortion) {
    animateCount(kcalEl, 0, cal, 700, v => `${v} kcal · ${food.serving || 'per serving'}`);
  } else {
    kcalEl.textContent = `${cal} kcal · ${food.serving || 'per serving'}`;
  }

  const thumb = document.getElementById('food-thumb');
  if (imageBase64) {
    thumb.innerHTML = `<img src="data:image/jpeg;base64,${imageBase64}" style="width:100%;height:100%;object-fit:cover;border-radius:16px"/>`;
  } else {
    thumb.textContent = '🍽️';
  }

  // health badge
  const hs = getHealthScore({ ...food, calories: cal, fat, sugar });
  document.getElementById('health-badge-wrap').innerHTML =
    `<div class="health-badge ${hs.cls}">${hs.label} · ${hs.score}/100</div>`;

  // animated bars
  const totalCal = (carbs * 4) + (protein * 4) + (fat * 9) || 1;
  const cp = Math.round((carbs * 4 / totalCal) * 100);
  const pp = Math.round((protein * 4 / totalCal) * 100);
  const fp = Math.round((fat * 9 / totalCal) * 100);

  setTimeout(() => {
    document.getElementById('bf-carbs').style.width   = cp + '%';
    document.getElementById('bf-protein').style.width = pp + '%';
    document.getElementById('bf-fat').style.width     = fp + '%';
    document.getElementById('bp-carbs').textContent   = cp + '%';
    document.getElementById('bp-protein').textContent = pp + '%';
    document.getElementById('bp-fat').textContent     = fp + '%';
  }, 200);

  // compare with daily goal
  renderCompareGoal({ cal, carbs, protein, fat });

  // vitamins & minerals (estimated from food type)
  renderVitamins(food, p);

  // 3D — only re-init on fresh scan

  updateFavBtn();
}

// ── CALORIE COUNTER ANIMATION ──
function animateCount(el, from, to, duration, formatter) {
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = formatter(Math.round(from + (to - from) * ease));
    el.classList.add('count-anim');
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── COMPARE WITH DAILY GOAL ──
function renderCompareGoal({ cal, carbs, protein, fat }) {
  const todayEntries = diary.filter(e => e.date === getToday());
  const usedKcal    = todayEntries.reduce((s, e) => s + (e.calories || 0), 0);
  const usedCarbs   = todayEntries.reduce((s, e) => s + (e.carbs || 0), 0);
  const usedProtein = todayEntries.reduce((s, e) => s + (e.protein || 0), 0);
  const usedFat     = todayEntries.reduce((s, e) => s + (e.fat || 0), 0);

 const dynCal = getCalGoal();
  const goals = { cal: dynCal, carbs: Math.round(dynCal * 0.45 / 4), protein: Math.round(dynCal * 0.25 / 4), fat: Math.round(dynCal * 0.30 / 9) };
  const items = [
    { name: 'Calories', used: usedKcal, add: cal, goal: goals.cal, unit: 'kcal' },
    { name: 'Carbs',    used: usedCarbs, add: carbs, goal: goals.carbs, unit: 'g' },
    { name: 'Protein',  used: usedProtein, add: protein, goal: goals.protein, unit: 'g' },
    { name: 'Fat',      used: usedFat, add: fat, goal: goals.fat, unit: 'g' },
  ];

  const wrap = document.getElementById('compare-goal-wrap');
  wrap.innerHTML = items.map(item => {
    const afterPct  = Math.min(((item.used + item.add) / item.goal) * 100, 120);
    const usedPct   = Math.min((item.used / item.goal) * 100, 100);
    const addPct    = Math.min(afterPct, 100) - usedPct;
    const remaining = Math.max(item.goal - item.used - item.add, 0);
    const cls = afterPct > 100 ? 'over' : afterPct > 80 ? 'warn' : '';
    return `<div class="cg-row">
      <div class="cg-meta">
        <span class="cg-name">${item.name}</span>
        <span class="cg-vals">+<span>${item.add}${item.unit}</span> / ${item.goal}${item.unit}</span>
      </div>
      <div class="cg-track">
        <div style="position:absolute;left:0;top:0;height:100%;width:${usedPct}%;background:#e0e0da;border-radius:99px;"></div>
        <div class="cg-fill ${cls}" style="position:absolute;left:${usedPct}%;top:0;width:${Math.max(addPct,0)}%;border-radius:0 99px 99px 0;transition:width 0.8s ease;"></div>
      </div>
      <div class="cg-remaining">${remaining > 0 ? remaining + item.unit + ' remaining' : '⚠ Over goal'}</div>
    </div>`;
  }).join('');

  // fix track positioning
  setTimeout(() => {
    wrap.querySelectorAll('.cg-track').forEach(t => t.style.position = 'relative');
  }, 10);
}







// ── VITAMINS & MINERALS ──
function renderVitamins(food, portion) {
  const grid = document.getElementById('vit-grid');

  if (food.vitaminC === -1) {
    grid.innerHTML = '<div style="font-size:0.78rem;color:var(--hint);text-align:center;padding:8px 0;">Vitamin data not available for complex meals</div>';
    return;
  }

  if (food.vitaminC === undefined || food.vitaminC === null) {
    grid.innerHTML = '<div style="font-size:0.78rem;color:var(--hint);text-align:center;padding:8px 0;">No vitamin data available</div>';
    return;
  }

  const data = {
    vitaminC:  Math.round((food.vitaminC  || 0) * portion * 10) / 10,
    iron:      Math.round((food.iron      || 0) * portion * 10) / 10,
    calcium:   Math.round((food.calcium   || 0) * portion * 10) / 10,
    potassium: Math.round((food.potassium || 0) * portion * 10) / 10
  };

  renderVitaminGrid(data, grid);
}

function renderVitaminGrid(data, grid) {
  const items = [
    { name: 'Vitamin C', val: data.vitaminC, unit: 'mg', goal: 90 },
    { name: 'Iron',      val: data.iron,     unit: 'mg', goal: 18 },
    { name: 'Calcium',   val: data.calcium,  unit: 'mg', goal: 1000 },
    { name: 'Potassium', val: data.potassium,unit: 'mg', goal: 3500 },
  ];

  grid.innerHTML = items.map(e => {
    const pct = Math.min(Math.round((e.val / e.goal) * 100), 100);
    return `<div class="vit-pill">
      <div class="vit-name">${e.name}</div>
      <div class="vit-val">${e.val}${e.unit}</div>
      <div class="vit-bar-track"><div class="vit-bar-fill" style="width:0%" data-w="${pct}%"></div></div>
    </div>`;
  }).join('');

  setTimeout(() => {
    grid.querySelectorAll('.vit-bar-fill').forEach(el => {
      el.style.width = el.dataset.w;
    });
  }, 300);
}




// ── MEAL CATEGORY PICKER ──
let selectedCategory = 'breakfast';
document.querySelectorAll('.cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedCategory = btn.dataset.cat;
  });
});

document.getElementById('log-btn').addEventListener('click', () => {
  
  if (!currentFood) return;
  const priceInput = document.getElementById('meal-price-input');
  const price = parseFloat(priceInput?.value || 0) || 0;
  const entry = {
    ...currentFood,
    calories: Math.round((currentFood.calories || 0) * portionMultiplier),
    carbs:    Math.round((currentFood.carbs || 0) * portionMultiplier * 10) / 10,
    protein:  Math.round((currentFood.protein || 0) * portionMultiplier * 10) / 10,
    fat:      Math.round((currentFood.fat || 0) * portionMultiplier * 10) / 10,
    id: Date.now(),
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    date: getToday(),
    portion: portionMultiplier,
    category: selectedCategory,
    price: price
  };
  diary.unshift(entry);
  localStorage.setItem('nutrisnap_diary', JSON.stringify(diary));

  // check if goal hit — trigger confetti
  const totalAfter = diary.filter(e => e.date === getToday()).reduce((s, e) => s + (e.calories || 0), 0);
  const totalBefore = totalAfter - entry.calories;
  if (totalBefore < CALORIE_GOAL && totalAfter >= CALORIE_GOAL) launchConfetti();

 imageBase64 = null;
  imageFile = null;
  showToast(`${currentFood.name} logged! ✓`);
  switchTab(document.querySelector('[data-screen="diary"]'));
});


function renderDiary() {
  updateBudgetUI();
  renderProteinDistribution(); 
  const todayEntries = diary.filter(e => e.date === getToday());
  const totalKcal    = todayEntries.reduce((s, e) => s + (e.calories || 0), 0);
  const totalCarbs   = todayEntries.reduce((s, e) => s + (e.carbs || 0), 0);
  const totalProtein = todayEntries.reduce((s, e) => s + (e.protein || 0), 0);
  const totalFat     = todayEntries.reduce((s, e) => s + (e.fat || 0), 0);

  document.getElementById('total-kcal').textContent    = totalKcal.toLocaleString();
  document.getElementById('total-carbs').textContent   = Math.round(totalCarbs) + 'g';
  document.getElementById('total-protein').textContent = Math.round(totalProtein) + 'g';
  document.getElementById('total-fat').textContent     = Math.round(totalFat) + 'g';

  const pct = Math.min(Math.round((totalKcal / getCalGoal()) * 100), 100);
  document.getElementById('ring-pct').textContent = pct + '%';
  const remaining = Math.max(getCalGoal() - totalKcal, 0);
  document.getElementById('ring-remaining').textContent = remaining.toLocaleString() + ' kcal remaining';
  drawRingCanvas(pct);

  // weekly bar chart
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const todayD = new Date();
  const weekGrid = document.getElementById('week-grid');
  const maxKcal = Math.max(getCalGoal(), 1);
  let weekHTML = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayD); d.setDate(todayD.getDate() - i);
    const ds = d.toDateString();
    const dayKcal = diary.filter(e => e.date === ds).reduce((s, e) => s + (e.calories || 0), 0);
    const barH = Math.round((dayKcal / maxKcal) * 56);
    const isToday = i === 0;
    const cls = isToday ? 'today' : (dayKcal > 0 ? 'has-data' : '');
    weekHTML += `<div class="week-day">
      <div class="week-bar-wrap"><div class="week-bar ${cls}" style="height:${Math.max(barH,4)}px"></div></div>
      <div class="week-lbl">${days[d.getDay()]}</div>
      <div class="week-kcal">${dayKcal > 0 ? dayKcal : ''}</div>
    </div>`;
  }
  
  const allBars = weekGrid.querySelectorAll('.week-bar');
  let tallest = 4;
  allBars.forEach(b => { const h = parseInt(b.style.height); if (h > tallest) tallest = h; });
  weekGrid.querySelectorAll('.week-bar-wrap').forEach(w => w.style.height = tallest + 'px');

  // search filter
  const q = (document.getElementById('diary-search')?.value || '').toLowerCase().trim();
  const filtered = todayEntries.filter(e => !q || e.name.toLowerCase().includes(q));

  const list = document.getElementById('diary-list');
  if (!filtered.length) {
    list.innerHTML = `<div class="empty-diary">${q ? 'No meals match your search' : 'No meals logged yet — scan some food!'}</div>`;
    return;
  }

  // group by category
  const catOrder = ['breakfast','lunch','dinner','snack'];
  const catLabels = { breakfast: '🌅 Breakfast', lunch: '☀️ Lunch', dinner: '🌙 Dinner', snack: '🍎 Snack' };
  const grouped = {};
  filtered.forEach(e => {
    const cat = e.category || 'snack';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(e);
  });

  let html = '';
  catOrder.forEach(cat => {
    if (!grouped[cat]) return;
    html += `<div class="diary-section-hdr">${catLabels[cat]}</div>`;
    html += grouped[cat].map(e => `
      <div class="meal-item">
        <div class="meal-left">
          <div class="meal-dot"></div>
          <div>
            <div class="meal-name">${e.name} <span class="cat-tag ${e.category || 'snack'}">${e.category || 'snack'}</span></div>
            <div class="meal-time">${e.time} · ${e.serving || 'serving'}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <div class="meal-kcal">${e.calories} kcal</div>
          <button class="meal-delete" onclick="deleteMeal(${e.id})">✕</button>
        </div>
      </div>
    `).join('');
  });

  list.innerHTML = html;
}


function drawRingCanvas(pct) {
  const canvas = document.getElementById('ring-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 36, cy = 36, r = 29, lw = 7;
  const isDarkMode = document.body.classList.contains('dark');
  const trackColor = isDarkMode ? '#2e3139' : '#ececea';
  const fillColor = getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#3B6D11';

  ctx.clearRect(0, 0, 72, 72);

  // background track
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = trackColor;
  ctx.lineWidth = lw;
  ctx.stroke();

  // animated fill arc
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (2 * Math.PI * Math.min(pct, 100) / 100);
  const startPct = 0;
  const duration = 900;
  const startTime = performance.now();

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const currentEnd = startAngle + (endAngle - startAngle) * ease;

    ctx.clearRect(0, 0, 72, 72);

    // track
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.strokeStyle = trackColor;
    ctx.lineWidth = lw;
    ctx.stroke();

    // fill
    if (pct > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, currentEnd);
      ctx.strokeStyle = fillColor;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    if (progress < 1) requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}


function deleteMeal(id) {
  diary = diary.filter(e => e.id !== id);
  localStorage.setItem('nutrisnap_diary', JSON.stringify(diary));
  renderDiary();
}


async function loadDeviceInfo() {
  document.getElementById('d-screen').textContent = `${window.screen.width} × ${window.screen.height}`;
  document.getElementById('d-cpu').textContent = (navigator.hardwareConcurrency || '—') + ' cores';
  document.getElementById('d-ram').textContent = navigator.deviceMemory ? `~${navigator.deviceMemory} GB` : 'unknown';

  const conn = navigator.connection;
  document.getElementById('d-network').textContent = conn ? (conn.effectiveType || conn.type || 'connected') : 'connected';

  const ua = navigator.userAgent;
  let os = 'Unknown';
  if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad/i.test(ua)) os = 'iOS';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac/i.test(ua)) os = 'macOS';
  document.getElementById('d-os').textContent = os;

  try {
    const bat = await navigator.getBattery();
    const pct = Math.round(bat.level * 100);
    document.getElementById('d-battery').textContent = pct + '% · ' + (bat.charging ? 'charging' : 'discharging');
  } catch(e) {
    document.getElementById('d-battery').textContent = 'unavailable';
  }
}


let insightLoaded = false;

async function loadAIInsight() {
  if (insightLoaded) return;

  const todayEntries = diary.filter(e => e.date === getToday());
  const body = document.getElementById('ai-insight-body');

  body.innerHTML = '<div class="ai-loading"><div class="spinner"></div><span>Generating insight…</span></div>';

  try {
    let prompt;
    if (todayEntries.length === 0) {
      prompt = 'Give me one short, friendly, motivational nutrition tip for starting the day. Keep it under 3 sentences. Be warm and encouraging. No formatting, just plain text.';
    } else {
      const summary = todayEntries.map(e => `${e.name} (${e.calories} kcal)`).join(', ');
      const totalKcal = todayEntries.reduce((s, e) => s + e.calories, 0);
      prompt = `I ate the following today: ${summary}. Total: ${totalKcal} kcal out of a ${getCalGoal()} kcal goal. Give me one short, personalized, friendly nutrition insight about my meals today. Max 3 sentences. Be specific to what I ate. No formatting, just plain text.`;
    }

    const text = await callGroq([{ role: 'user', content: prompt }], 200) || 'Keep tracking your meals for personalized insights!';
    body.innerHTML = `<div class="ai-text">${text}</div>`;
    insightLoaded = true;

  } catch(e) {
    body.innerHTML = '<div class="ai-text">Stay hydrated and aim for balanced meals with a good mix of protein, healthy fats, and complex carbs!</div>';
    insightLoaded = true;
  }
}


// ═══════════════════════════════
// MANUAL SEARCH WITH SUGGESTIONS
// ═══════════════════════════════
const FOOD_SUGGESTIONS = {
  chicken:  ['Grilled chicken breast','Fried chicken','Chicken wings','Roast chicken','Raw chicken breast','Chicken thigh','Chicken soup'],
  beef:     ['Ground beef','Beef steak','Beef burger','Beef stew','Roast beef','Beef kebab'],
  rice:     ['White rice cooked','Brown rice cooked','Fried rice','Rice pilaf','Basmati rice'],
  pasta:    ['Pasta with tomato sauce','Spaghetti bolognese','Pasta carbonara','Mac and cheese','Penne arrabbiata'],
  egg:      ['Boiled egg','Fried egg','Scrambled eggs','Omelette','Poached egg'],
  banana:   ['Banana fresh','Banana smoothie','Banana bread','Dried banana'],
  apple:    ['Apple fresh','Apple juice','Apple pie','Baked apple'],
  bread:    ['White bread','Whole wheat bread','Sourdough bread','Pita bread','Toast'],
  milk:     ['Whole milk','Skimmed milk','Oat milk','Almond milk','Soy milk'],
  potato:   ['Boiled potato','Mashed potato','French fries','Baked potato','Sweet potato'],
  fish:     ['Grilled salmon','Tuna in water','Fried fish','Fish fillet','Sardines'],
  salad:    ['Caesar salad','Greek salad','Garden salad','Chicken salad','Tuna salad'],
  pizza:    ['Margherita pizza','Pepperoni pizza','Vegetable pizza','Cheese pizza'],
  sandwich: ['Chicken sandwich','Tuna sandwich','BLT sandwich','Grilled cheese sandwich'],
  soup:     ['Tomato soup','Chicken soup','Lentil soup','Vegetable soup'],
};

let searchTimer = null;
let suggestionsVisible = false;

document.getElementById('manual-input').addEventListener('input', function() {
  clearTimeout(searchTimer);
  const q = this.value.trim().toLowerCase();
  if (q.length < 2) { hideSuggestions(); return; }

  // check local suggestions first
  const localSuggestions = [];
  Object.keys(FOOD_SUGGESTIONS).forEach(key => {
    if (key.includes(q) || q.includes(key)) {
      localSuggestions.push(...FOOD_SUGGESTIONS[key]);
    }
  });

  // also match any suggestion that contains the query
  Object.values(FOOD_SUGGESTIONS).flat().forEach(s => {
    if (s.toLowerCase().includes(q) && !localSuggestions.includes(s)) {
      localSuggestions.push(s);
    }
  });

  if (localSuggestions.length > 0) {
    showSuggestions(localSuggestions.slice(0, 6));
  } else {
    // ask Gemini for suggestions after 600ms delay
    searchTimer = setTimeout(() => fetchSuggestions(q), 600);
  }
});

async function fetchSuggestions(q) {
  if (Date.now() < rateLimitUntil) return;
  try {
    const prompt = `List 5 specific variations of "${q}" as a food item. Examples: if query is "chicken" return ["Grilled chicken breast","Fried chicken","Chicken soup","Roast chicken","Chicken wings"]. Respond ONLY with a JSON array of strings, no markdown.`;
    const raw = await callGroq([{ role: 'user', content: prompt }], 150);
    if (!raw) return;
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const suggestions = JSON.parse(match[0]);
      if (Array.isArray(suggestions)) showSuggestions(suggestions.slice(0, 6));
    }
  } catch(e) {}
}

function showSuggestions(items) {
  const box = document.getElementById('search-suggestions');
  box.innerHTML = '';
  items.forEach(item => {
    const div = document.createElement('div');
    div.textContent = item;
    div.addEventListener('click', () => selectSuggestion(item));
    div.style.cssText = 'padding:11px 14px;font-size:0.82rem;color:var(--text);border-bottom:1px solid var(--border);cursor:pointer;';
    div.addEventListener('mouseover', () => div.style.background = 'var(--off)');
    div.addEventListener('mouseout', () => div.style.background = '');
    box.appendChild(div);
  });
  box.style.display = 'block';
  suggestionsVisible = true;
}

function hideSuggestions() {
  document.getElementById('search-suggestions').style.display = 'none';
  suggestionsVisible = false;
}

function selectSuggestion(item) {
  document.getElementById('manual-input').value = item;
  hideSuggestions();
  manualSearch(item);
}

document.addEventListener('click', e => {
  if (!e.target.closest('.manual-wrap')) hideSuggestions();
});

document.getElementById('manual-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const val = document.getElementById('manual-input').value.trim();
    hideSuggestions();
    if (val) manualSearch(val);
  }
  if (e.key === 'Escape') hideSuggestions();
});

async function manualSearch(overrideQuery) {
  const q = overrideQuery || document.getElementById('manual-input').value.trim();
  if (!q) return;
  if (Date.now() < rateLimitUntil) { showToast('Please wait for cooldown'); return; }

  hideSuggestions();
  const btn = document.getElementById('manual-input');
  btn.disabled = true;
  showToast('Searching…');

  try {
    const prompt = `Nutrition per 100g for "${q}". Return ONLY this JSON, no extra text:\n{"name":"","calories":0,"carbs":0,"protein":0,"fat":0,"fiber":0,"sugar":0,"serving":"100g","ingredients":[],"vitaminC":0,"iron":0,"calcium":0,"potassium":0}\nAll values per 100g, numbers only. For ingredients list main components. For vitaminC, iron, calcium, potassium provide accurate values in mg. If complex meal with more than 3 ingredients set vitaminC, iron, calcium, potassium all to -1.`;

    const raw = await callGroq([{ role: 'user', content: prompt }], 800);
    if (!raw) throw new Error('No data');
    let jsonStr2 = (raw.match(/\{[\s\S]*/) || [''])[0];
    if (!jsonStr2) throw new Error('No data');
    if (!jsonStr2.includes('}')) jsonStr2 += ',"fiber":2,"sugar":5,"serving":"1 serving"}';
    else if ((jsonStr2.match(/\{/g)||[]).length > (jsonStr2.match(/\}/g)||[]).length) jsonStr2 += '}';

    try {
      currentFood = JSON.parse(jsonStr2);
    } catch(e) {
      const ex = (k) => { const m = raw.match(new RegExp(`"${k}"\\s*:\\s*([\\d.]+)`)); return m ? parseFloat(m[1]) : 0; };
      const nm = raw.match(/"name"\s*:\s*"([^"]+)"/);
      currentFood = { name: nm?.[1]||'Unknown', calories:ex('calories'), carbs:ex('carbs'), protein:ex('protein'), fat:ex('fat'), fiber:ex('fiber'), sugar:ex('sugar'), serving:'1 serving', ingredients:[] };
      if (!currentFood.calories) throw new Error('No data');
    }
    imageBase64 = null;
    document.getElementById('manual-input').value = '';
    showResult(currentFood);
    insightLoaded = false;
    incrementScanCounter();
    const lastBtn = document.getElementById('last-result-btn');
    if (lastBtn) lastBtn.style.display = 'block';
    showResultScreen();

  } catch(err) {
    showToast('Could not find food. Try a different name.');
  } finally {
    btn.disabled = false;
  }
}

// ═══════════════════════════════
// PROFILE & GOALS
// ═══════════════════════════════
let profile = JSON.parse(localStorage.getItem('nutrisnap_profile') || '{}');
let userGoal = profile.goal || 'maintain';
let waterConsumed = parseInt(localStorage.getItem('nutrisnap_water_' + getToday()) || '0');

function loadProfile() {
  if (profile.name)   document.getElementById('p-name').value = profile.name;
  if (profile.age)    document.getElementById('p-age').value = profile.age;
  if (profile.gender) document.getElementById('p-gender').value = profile.gender;
  if (profile.height) document.getElementById('p-height').value = profile.height;
  if (profile.heightUnit) document.getElementById('p-height-unit').value = profile.heightUnit;
  if (profile.weight) document.getElementById('p-weight').value = profile.weight;
  if (profile.weightUnit) document.getElementById('p-weight-unit').value = profile.weightUnit;
  if (profile.activity) document.getElementById('p-activity').value = profile.activity;

  // goal buttons
  userGoal = profile.goal || 'maintain';
  document.querySelectorAll('[data-goal]').forEach(b => b.classList.toggle('active', b.dataset.goal === userGoal));

  recalcGoals();
  updateWaterUI();
  updateStreak();
}

function saveProfile() {
  profile.name       = document.getElementById('p-name').value;
  profile.age        = parseFloat(document.getElementById('p-age').value) || null;
  profile.gender     = document.getElementById('p-gender').value;
  profile.height     = parseFloat(document.getElementById('p-height').value) || null;
  profile.heightUnit = document.getElementById('p-height-unit').value;
  profile.weight     = parseFloat(document.getElementById('p-weight').value) || null;
  profile.weightUnit = document.getElementById('p-weight-unit').value;
  profile.activity   = parseFloat(document.getElementById('p-activity').value);
  profile.goal       = userGoal;
  localStorage.setItem('nutrisnap_profile', JSON.stringify(profile));
}

function selectGoal(btn) {
  document.querySelectorAll('[data-goal]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  userGoal = btn.dataset.goal;
  saveProfile();
  recalcGoals();
}

function recalcGoals() {
  let weightKg = profile.weight || null;
  if (weightKg && profile.weightUnit === 'lb') weightKg = weightKg * 0.453592;

  let heightCm = profile.height || null;
  if (heightCm && profile.heightUnit === 'ft') heightCm = heightCm * 30.48;

  const age      = profile.age || null;
  const gender   = profile.gender || 'male';
  const activity = profile.activity || 1.55;

  if (!weightKg || !heightCm || !age) {
    document.getElementById('g-calories').textContent = '—';
    document.getElementById('g-protein').textContent  = '—';
    document.getElementById('g-bmi').textContent      = '—';
    document.getElementById('g-ideal').textContent    = '—';
    return;
  }

  // BMR — Mifflin-St Jeor
  let bmr;
  if (gender === 'male') bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  else                   bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  let tdee = Math.round(bmr * activity);
  if (userGoal === 'lose')     tdee -= 500;
  else if (userGoal === 'gain') tdee += 300;

  const proteinG = Math.round(weightKg * (userGoal === 'gain' ? 2.0 : 1.6));

  // BMI
  const bmi = Math.round((weightKg / Math.pow(heightCm / 100, 2)) * 10) / 10;
  let bmiLabel = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';

  // ideal weight (Devine formula)
  let idealKg;
  if (gender === 'male') idealKg = 50 + 2.3 * ((heightCm / 2.54) - 60);
  else                   idealKg = 45.5 + 2.3 * ((heightCm / 2.54) - 60);
  idealKg = Math.max(40, Math.round(idealKg));

  const idealDisplay = profile.weightUnit === 'lb'
    ? Math.round(idealKg * 2.20462) + ' lb'
    : idealKg + ' kg';

  document.getElementById('g-calories').textContent = tdee.toLocaleString();
  document.getElementById('g-protein').textContent  = proteinG + 'g';
  document.getElementById('g-bmi').textContent      = bmi + ' · ' + bmiLabel;
  document.getElementById('g-ideal').textContent    = idealDisplay;
  document.getElementById('p-bmi-label').textContent = `BMI: ${bmi} (${bmiLabel})`;

  // update calorie goal dynamically
  window.DYNAMIC_CALORIE_GOAL = tdee;

  // water goal: 35ml per kg bodyweight
  const waterGoalMl = Math.round(weightKg * 35 / 50) * 50;
  localStorage.setItem('nutrisnap_water_goal', waterGoalMl);
  document.getElementById('water-goal-lbl').textContent = waterGoalMl.toLocaleString() + ' ml';
  document.getElementById('water-tip').textContent =
    `Based on your weight (${Math.round(weightKg)}kg), you should drink ~${waterGoalMl}ml daily. That's roughly ${Math.round(waterGoalMl/250)} glasses of water.`;
  updateWaterUI();
}

// ── WATER TRACKER ──
function addWater(ml) {
  waterConsumed += ml;
  localStorage.setItem('nutrisnap_water_' + getToday(), waterConsumed);
  updateWaterUI();
}

function resetWater() {
  waterConsumed = 0;
  localStorage.setItem('nutrisnap_water_' + getToday(), 0);
  updateWaterUI();
}

function updateWaterUI() {
  const goal = parseInt(localStorage.getItem('nutrisnap_water_goal') || 2000);
  const pct = Math.min(Math.round((waterConsumed / goal) * 100), 100);
  document.getElementById('water-consumed').textContent = waterConsumed.toLocaleString() + ' ml';
  document.getElementById('water-pct').textContent = pct + '%';
  const bar = document.getElementById('water-bar');
  if (bar) bar.style.width = pct + '%';
}

// ── STREAK ──
function updateStreak() {
  const dateSet = new Set(diary.map(e => e.date));
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const ds = d.toDateString();
    if (dateSet.has(ds)) streak++;
    else if (i > 0) break;
    d.setDate(d.getDate() - 1);
  }
  document.getElementById('streak-num').textContent = streak;
  document.getElementById('streak-msg').textContent = streak === 0
    ? 'Log food today to start your streak!'
    : streak === 1 ? 'Great start! Keep going tomorrow!'
    : `Amazing! ${streak} days in a row! 🔥`;
}

function updateScanCounter() {
  const key = 'nutrisnap_scans_' + getToday();
  const count = parseInt(localStorage.getItem(key) || '0');
  document.getElementById('scan-count').textContent = count;
}

function incrementScanCounter() {
  const key = 'nutrisnap_scans_' + getToday();
  const count = parseInt(localStorage.getItem(key) || '0') + 1;
  localStorage.setItem(key, count);
  updateScanCounter();
}


// ═══════════════════════════════
// CONFETTI
// ═══════════════════════════════
function launchConfetti() {
  const wrap = document.getElementById('confetti-wrap');
  const colors = ['#3B6D11','#97C459','#d8ff47','#47ffc8','#f0f7eb','#639922','#ffcc00'];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.cssText = `left:${Math.random()*100}%;background:${colors[Math.floor(Math.random()*colors.length)]};width:${4+Math.random()*8}px;height:${4+Math.random()*8}px;animation-duration:${1.5+Math.random()*2}s;animation-delay:${Math.random()*0.6}s;border-radius:${Math.random()>0.5?'50%':'2px'};`;
    el.addEventListener('animationend', () => el.remove(), { once: true });
    frag.appendChild(el);
  }
  wrap.appendChild(frag);
  showToast('🎉 Daily goal reached!');
}


function confirmClearAll() { document.getElementById('clear-modal').classList.add('show'); }
function closeClearModal()  { document.getElementById('clear-modal').classList.remove('show'); }
function clearAllMeals() {
  diary = diary.filter(e => e.date !== getToday());
  localStorage.setItem('nutrisnap_diary', JSON.stringify(diary));
  closeClearModal();
  renderDiary();
  showToast('All meals cleared');
}
document.getElementById('clear-modal').addEventListener('click', function(e) {
  if (e.target === this) closeClearModal();
});

// ── DIARY SEARCH LIVE FILTER ──
let searchDebounce;
document.getElementById('diary-search').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(renderDiary, 150);
});

// ══════════════════════════════
// DARK MODE
// ══════════════════════════════
let isDark = localStorage.getItem('nutrisnap_dark') === '1';

function applyDark() {
  document.body.classList.toggle('dark', isDark);
  const btn = document.getElementById('dark-toggle');
  btn.innerHTML = isDark
    ? '<i class="fa-regular fa-sun" style="color:#5fb832;font-size:1rem;"></i>'
    : '<i class="fa-solid fa-moon" style="color:#3d7a14;font-size:1rem;"></i>';

}
function toggleDark() {
  isDark = !isDark;
  localStorage.setItem('nutrisnap_dark', isDark ? '1' : '0');
  applyDark();
}

// ══════════════════════════════
// FAVORITES
// ══════════════════════════════
let favorites = JSON.parse(localStorage.getItem('nutrisnap_favorites') || '[]');

function toggleFavorite() {
  if (!currentFood) return;
  const btn = document.getElementById('fav-btn');
  const idx = favorites.findIndex(f => f.name.toLowerCase() === currentFood.name.toLowerCase());
  if (idx === -1) {
    favorites.unshift({ ...currentFood, savedAt: Date.now() });
    btn.innerHTML = '<i class="fa-solid fa-heart"></i>';
    btn.classList.add('saved');
    showToast(`${currentFood.name} saved to favorites!`);
  } else {
    favorites.splice(idx, 1);
    btn.innerHTML = '<i class="fa-regular fa-heart"></i>';
    btn.classList.remove('saved');
    showToast('Removed from favorites');
  }
  localStorage.setItem('nutrisnap_favorites', JSON.stringify(favorites));
}

function updateFavBtn() {
  if (!currentFood) return;
  const btn = document.getElementById('fav-btn');
  const saved = favorites.some(f => f.name.toLowerCase() === currentFood.name.toLowerCase());
  btn.innerHTML = saved ? '<i class="fa-solid fa-heart"></i>' : '<i class="fa-regular fa-heart"></i>';
  btn.classList.toggle('saved', saved);
}

function renderFavorites() {
  const list = document.getElementById('favorites-list');
  if (!favorites.length) {
    list.innerHTML = `<div style="text-align:center;padding:3rem 1rem;color:var(--hint);font-size:0.82rem;">
      <div style="font-size:2.5rem;margin-bottom:10px;opacity:0.3;">🤍</div>
      No favorites yet — tap the heart on any result to save it!
    </div>`;
    return;
  }
  list.innerHTML = favorites.map((f, i) => `
    <div class="fav-item" style="animation-delay:${i * 0.04}s">
      <div style="font-size:1.5rem;">🍽️</div>
      <div class="fav-info">
        <div class="fav-name">${f.name}</div>
        <div class="fav-meta">${f.calories} kcal · ${f.serving || 'per serving'}</div>
      </div>
      <button class="fav-log-btn" onclick="logFavorite(${i})">+ Log</button>
      <button class="fav-delete" onclick="deleteFavorite(${i})">✕</button>
    </div>
  `).join('');
}

function logFavorite(idx) {
  const f = favorites[idx];
  if (!f) return;
  currentFood = f;
  imageBase64 = null;
  showResult(f);
  document.getElementById('last-result-btn').style.display = 'block';
  showResultScreen();
  showToast(`${f.name} loaded — tap Log to diary!`);
}

function deleteFavorite(idx) {
  favorites.splice(idx, 1);
  localStorage.setItem('nutrisnap_favorites', JSON.stringify(favorites));
  renderFavorites();
}

function toggleFavoritesSection() {
  const section = document.getElementById('favorites-section');
  const visible = section.style.display !== 'none';
  section.style.display = visible ? 'none' : 'block';
  if (!visible) renderFavorites();
}



// ══════════════════════════════
// DASHBOARD
// ══════════════════════════════
let chartCalories = null;
let chartMacros = null;

let dashboardDiaryLength = -1;

function renderDashboard() {
  if (diary.length !== dashboardDiaryLength) {
    renderCaloriesChart();
    renderMacrosChart();
    dashboardDiaryLength = diary.length;
  }
  renderWeeklyScore();
}

function renderCaloriesChart() {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const labels = [];
  const data = [];
  const todayD = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayD);
    d.setDate(todayD.getDate() - i);
    const ds = d.toDateString();
    const kcal = diary.filter(e => e.date === ds).reduce((s, e) => s + (e.calories || 0), 0);
    labels.push(i === 0 ? 'Today' : days[d.getDay()]);
    data.push(kcal);
  }

  const ctx = document.getElementById('chart-calories').getContext('2d');
  if (chartCalories) chartCalories.destroy();

  chartCalories = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: data.map((v, i) => i === 6 ? '#3B6D11' : '#c8e6a0'),
        borderRadius: 8,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ctx.parsed.y + ' kcal' }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { font: { size: 11 }, color: '#888' }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: '#888' }
        }
      }
    }
  });
}

function renderMacrosChart() {
  const todayEntries = diary.filter(e => e.date === getToday());
  const carbs   = todayEntries.reduce((s, e) => s + (e.carbs || 0), 0);
  const protein = todayEntries.reduce((s, e) => s + (e.protein || 0), 0);
  const fat     = todayEntries.reduce((s, e) => s + (e.fat || 0), 0);
  const total   = carbs + protein + fat || 1;

  const ctx = document.getElementById('chart-macros').getContext('2d');
  if (chartMacros) chartMacros.destroy();

  chartMacros = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Carbs', 'Protein', 'Fat'],
      datasets: [{
        data: [Math.round(carbs), Math.round(protein), Math.round(fat)],
        backgroundColor: ['#3B6D11', '#639922', '#97C459'],
        borderWidth: 0,
      }]
    },
    options: {
      responsive: false,
      cutout: '70%',
      plugins: { legend: { display: false } }
    }
  });

  document.getElementById('macro-legend').innerHTML = [
    { label: 'Carbs',   val: Math.round(carbs),   color: '#3B6D11', pct: Math.round((carbs/total)*100) },
    { label: 'Protein', val: Math.round(protein), color: '#639922', pct: Math.round((protein/total)*100) },
    { label: 'Fat',     val: Math.round(fat),     color: '#97C459', pct: Math.round((fat/total)*100) },
  ].map(m => `
    <div style="display:flex;align-items:center;gap:8px;">
      <div style="width:10px;height:10px;border-radius:50%;background:${m.color};flex-shrink:0;"></div>
      <div style="font-size:0.75rem;color:var(--sub);">${m.label}</div>
      <div style="margin-left:auto;font-size:0.75rem;font-weight:700;color:var(--text);">${m.val}g <span style="color:var(--hint);font-weight:400;">${m.pct}%</span></div>
    </div>
  `).join('');
}

function renderWeeklyScore() {
  const todayD = new Date();
  let totalScore = 0;
  let daysWithData = 0;

  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayD);
    d.setDate(todayD.getDate() - i);
    const entries = diary.filter(e => e.date === d.toDateString());
    if (!entries.length) continue;
    daysWithData++;
    const kcal = entries.reduce((s, e) => s + (e.calories || 0), 0);
    const goal = window.DYNAMIC_CALORIE_GOAL || CALORIE_GOAL;
    const diff = Math.abs(kcal - goal) / goal;
    totalScore += Math.max(0, Math.round((1 - diff) * 100));
  }

  const score = daysWithData ? Math.round(totalScore / daysWithData) : 0;
  const lbl = score >= 80 ? '🔥 Excellent week!' : score >= 60 ? '👍 Good progress' : score > 0 ? '💪 Keep going!' : 'Log meals to see your score';

  document.getElementById('weekly-score').textContent = daysWithData ? score : '—';
  document.getElementById('weekly-score-lbl').textContent = lbl;
  drawScoreCanvas(daysWithData ? score : 0);
}

function drawScoreCanvas(score) {
  const canvas = document.getElementById('score-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 40, cy = 40, r = 32, lw = 8;
  const isDarkMode = document.body.classList.contains('dark');
  const trackColor = isDarkMode ? '#2e3139' : '#ececea';
  const color = score >= 80 ? '#3d7a14' : score >= 60 ? '#e6a817' : score > 0 ? '#c94040' : '#ececea';

  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + (2 * Math.PI * score / 100);
  const duration = 900;
  const startTime = performance.now();

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const currentEnd = startAngle + (endAngle - startAngle) * ease;

    ctx.clearRect(0, 0, 80, 80);

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.strokeStyle = trackColor;
    ctx.lineWidth = lw;
    ctx.stroke();

    if (score > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, currentEnd);
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    if (progress < 1) requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);

}




// ══════════════════════════════
// BARCODE SCANNER
// ══════════════════════════════
let barcodeStream = null;
let barcodeScanning = false;

async function startBarcodeScanner() {
  const video = document.getElementById('barcode-video');
  document.getElementById('barcode-start-btn').style.display = 'none';
  document.getElementById('barcode-stop-btn').style.display = 'block';
  document.getElementById('barcode-status').style.display = 'flex';

  if (!('BarcodeDetector' in window)) {
    showToast('Barcode scanning not supported on this browser. Use manual entry.');
    stopBarcodeScanner();
    return;
  }

  try {
    barcodeStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    video.srcObject = barcodeStream;
    await video.play();
    barcodeScanning = true;

    const scanTimeout = setTimeout(() => {
      if (barcodeScanning) {
        stopBarcodeScanner();
        showToast('No barcode found. Try manual entry.');
      }
    }, 30000);

    const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });

    async function scan() {
      if (!barcodeScanning) return;
      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          const code = barcodes[0].rawValue;
          clearTimeout(scanTimeout);
          stopBarcodeScanner();
          lookupBarcode(code);
          return;
        }
      } catch(e) {}
      requestAnimationFrame(scan);
    }
    scan();

  } catch(err) {
    showToast('Camera error: ' + err.message);
    stopBarcodeScanner();
  }
}

function stopBarcodeScanner() {
  if (barcodeScanning) {
    barcodeScanning = false;
    if (barcodeStream) {
      barcodeStream.getTracks().forEach(t => t.stop());
      barcodeStream = null;
    }
    const video = document.getElementById('barcode-video');
    video.srcObject = null;
  }
  document.getElementById('barcode-start-btn').style.display = 'block';
  document.getElementById('barcode-stop-btn').style.display = 'none';
  document.getElementById('barcode-status').style.display = 'none';
}

async function lookupBarcode(code) {
  if (!code) return;
  document.getElementById('barcode-status').style.display = 'flex';
  document.getElementById('barcode-status-txt').textContent = 'Looking up product…';

  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
    const data = await res.json();

    if (data.status !== 1 || !data.product) {
      showToast('Product not found. Try another barcode.');
      document.getElementById('barcode-status').style.display = 'none';
      return;
    }

    const p = data.product;
    const n = p.nutriments || {};

    currentFood = {
      name:     p.product_name || 'Unknown product',
      calories: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0),
      carbs:    Math.round((n['carbohydrates_100g'] || 0) * 10) / 10,
      protein:  Math.round((n['proteins_100g'] || 0) * 10) / 10,
      fat:      Math.round((n['fat_100g'] || 0) * 10) / 10,
      fiber:    Math.round((n['fiber_100g'] || 0) * 10) / 10,
      sugar:    Math.round((n['sugars_100g'] || 0) * 10) / 10,
      serving:  p.serving_size || '100g',
      barcode:  code
    };

    imageBase64 = null;
    document.getElementById('barcode-status').style.display = 'none';

    // show mini result in barcode screen
    document.getElementById('barcode-result').style.display = 'block';
    document.getElementById('barcode-result').innerHTML = `
      <div class="section-bg" style="display:flex;align-items:center;gap:12px;">
        <div style="font-size:2rem;">📦</div>
        <div style="flex:1;">
          <div style="font-weight:700;color:var(--text);font-size:0.9rem;text-transform:capitalize;">${currentFood.name}</div>
          <div style="font-size:0.78rem;color:var(--green);font-weight:600;margin-top:2px;">${currentFood.calories} kcal · ${currentFood.serving}</div>
        </div>
      </div>
      <button class="btn-primary" style="margin-top:10px;" onclick="showResultScreen();showResult(currentFood);">View full nutrition →</button>
    `;

    showToast(`Found: ${currentFood.name}!`);

  } catch(err) {
    showToast('Error looking up product.');
    document.getElementById('barcode-status').style.display = 'none';
    console.error(err);
  }
}


function toggleBarcodeSection() {
  const section = document.getElementById('barcode-section');
  const btn = document.getElementById('barcode-toggle-btn');
  const visible = section.style.display !== 'none';
  section.style.display = visible ? 'none' : 'block';
  btn.innerHTML = visible ? '<i class="fa-solid fa-barcode"></i> Scan barcode' : '<i class="fa-solid fa-xmark"></i> Close barcode';
  if (visible) stopBarcodeScanner();
}






// ══════════════════════════════
// BUDGET TRACKER
// ══════════════════════════════
let dailyBudget = parseFloat(localStorage.getItem('nutrisnap_budget') || '20');

function saveBudget() {
  const input = document.getElementById('budget-input');
  const val = parseFloat(input.value);
  if (!val || val <= 0) { showToast('Enter a valid budget'); return; }
  dailyBudget = val;
  localStorage.setItem('nutrisnap_budget', val);
  input.value = '';
  updateBudgetUI();
  showToast(`Budget set to $${val.toFixed(2)}!`);
}

function updateBudgetUI() {
  const todayEntries = diary.filter(e => e.date === getToday());
  const spent = todayEntries.reduce((s, e) => s + (e.price || 0), 0);
  const pct = Math.min(Math.round((spent / dailyBudget) * 100), 100);

  document.getElementById('budget-spent').textContent = '$' + spent.toFixed(2);
  document.getElementById('budget-goal-lbl').textContent = '$' + dailyBudget.toFixed(2);
  document.getElementById('budget-pct').textContent = pct + '%';

  const bar = document.getElementById('budget-bar');
  if (bar) {
    bar.style.width = pct + '%';
    bar.style.background = pct >= 100 ? 'var(--red)' : pct >= 80 ? '#e6a817' : 'var(--green)';
  }
}



// ══════════════════════════════
// PROTEIN DISTRIBUTION ANALYZER
// ══════════════════════════════
function renderProteinDistribution() {
  const todayEntries = diary.filter(e => e.date === getToday());
  const wrap = document.getElementById('protein-dist-wrap');
  if (!wrap) return;

  if (!todayEntries.length) {
    wrap.innerHTML = '<div style="font-size:0.78rem;color:var(--hint);text-align:center;padding:8px 0;">Log meals to see protein distribution</div>';
    return;
  }

  const catOrder = ['breakfast','lunch','dinner','snack'];
  const catLabels = { breakfast:'Breakfast', lunch:'Lunch', dinner:'Dinner', snack:'Snack' };
  const totalProtein = todayEntries.reduce((s, e) => s + (e.protein || 0), 0);
  

  // group protein by meal category
  const bycat = {};
  catOrder.forEach(c => bycat[c] = 0);
  todayEntries.forEach(e => {
    const cat = e.category || 'snack';
    bycat[cat] += (e.protein || 0);
  });

  // score — ideal is roughly equal distribution
  const filled = catOrder.filter(c => bycat[c] > 0).length;
  const score = filled >= 3 ? '🟢 Well distributed' : filled === 2 ? '🟡 Decent spread' : '🔴 Too concentrated';

  wrap.innerHTML = `
    <div style="font-size:0.75rem;color:var(--sub);margin-bottom:10px;">${score} · ${Math.round(totalProtein)}g total today</div>
    ${catOrder.map(cat => {
      const val = Math.round(bycat[cat] * 10) / 10;
      const pct = totalProtein > 0 ? Math.round((bycat[cat] / totalProtein) * 100) : 0;
      return `
        <div style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
            <span style="font-size:0.75rem;color:var(--sub);">${catLabels[cat]}</span>
            <span style="font-size:0.75rem;font-weight:700;color:var(--text);">${val}g <span style="color:var(--hint);font-weight:400;">${pct}%</span></span>
          </div>
          <div style="height:6px;background:var(--off);border-radius:99px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:var(--green);border-radius:99px;transition:width 0.8s ease;"></div>
          </div>
        </div>`;
    }).join('')}
  `;
}



// ══════════════════════════════
// EATING PATTERN DETECTION
// ══════════════════════════════
async function analyzeEatingPatterns() {
  const wrap = document.getElementById('eating-patterns-wrap');
  if (!wrap) return;

  // get last 7 days of data
  const todayD = new Date();
  const weekEntries = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayD);
    d.setDate(todayD.getDate() - i);
    const ds = d.toDateString();
    const entries = diary.filter(e => e.date === ds);
    if (entries.length) weekEntries.push(...entries.map(e => ({ ...e, dayIndex: i })));
  }

  if (weekEntries.length < 2) {
    wrap.innerHTML = '<div style="font-size:0.78rem;color:var(--hint);text-align:center;padding:8px 0;">Log at least 2 days of meals to see patterns</div>';
    return;
  }

  // local pattern detection — no API needed
  const patterns = [];

  // check breakfast habit
  const daysWithBreakfast = new Set(weekEntries.filter(e => e.category === 'breakfast').map(e => e.date)).size;
  const daysLogged = new Set(weekEntries.map(e => e.date)).size;
  if (daysWithBreakfast === 0) patterns.push({ icon: '⚠️', text: '<strong>No breakfast logged</strong> — you may be skipping the most important meal of the day.' });
  else if (daysWithBreakfast < daysLogged) patterns.push({ icon: '🌅', text: `<strong>Inconsistent breakfast</strong> — you only had breakfast ${daysWithBreakfast} out of ${daysLogged} days logged.` });
  else patterns.push({ icon: '✅', text: '<strong>Great breakfast habit</strong> — you consistently eat breakfast. Keep it up!' });

  // check biggest meal
  const catTotals = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
  weekEntries.forEach(e => { catTotals[e.category || 'snack'] += (e.calories || 0); });
  const biggest = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  patterns.push({ icon: '🍽️', text: `<strong>Biggest meal: ${biggest[0]}</strong> — most of your calories come from ${biggest[0]}.` });

  // check snacking
  const snackDays = new Set(weekEntries.filter(e => e.category === 'snack').map(e => e.date)).size;
  if (snackDays >= 5) patterns.push({ icon: '🍎', text: '<strong>Frequent snacker</strong> — you snack almost every day. Make sure snacks are healthy!' });
  else if (snackDays === 0) patterns.push({ icon: '👍', text: '<strong>No snacking</strong> — you stick to main meals. Great for blood sugar control!' });

  // check calorie consistency
  const dailyKcals = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayD); d.setDate(todayD.getDate() - i);
    const kcal = diary.filter(e => e.date === d.toDateString()).reduce((s, e) => s + (e.calories || 0), 0);
    if (kcal > 0) dailyKcals.push(kcal);
  }
  if (dailyKcals.length >= 2) {
    const avg = dailyKcals.reduce((a, b) => a + b, 0) / dailyKcals.length;
    const max = Math.max(...dailyKcals);
    const min = Math.min(...dailyKcals);
    if (max - min > 800) patterns.push({ icon: '📊', text: `<strong>Inconsistent calories</strong> — your intake varies a lot (${min}–${max} kcal). Try to stay closer to your ${Math.round(avg)} kcal average.` });
    else patterns.push({ icon: '🎯', text: `<strong>Consistent intake</strong> — your daily calories are steady around ${Math.round(avg)} kcal. Great consistency!` });
  }

  wrap.innerHTML = patterns.map(p => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <div style="font-size:1.1rem;flex-shrink:0;">${p.icon}</div>
      <div style="font-size:0.78rem;color:var(--sub);line-height:1.6;">${p.text}</div>
    </div>
  `).join('').replace(/border-bottom[^;]+;(?=[^<]*<\/div>\s*$)/, '');
}




// ══════════════════════════════
// MEAL PLANNER
// ══════════════════════════════
let selectedCuisine = 'any';
let selectedMealType = 'both';
let lastMealSuggestions = null;

function selectCuisine(btn) {
  document.querySelectorAll('[data-cuisine]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedCuisine = btn.dataset.cuisine;
  lastMealSuggestions = null;
}

function selectMealType(btn) {
  document.querySelectorAll('[data-mealtype]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedMealType = btn.dataset.mealtype;
  lastMealSuggestions = null;
}

async function generateMealSuggestions() {
  const target = parseInt(document.getElementById('meal-cal-target').value);
  if (!target || target < 50) { showToast('Enter a calorie target first!'); return; }

  // use cache if same target
 if (lastMealSuggestions && lastMealSuggestions.target === target && lastMealSuggestions.cuisine === selectedCuisine && lastMealSuggestions.type === selectedMealType) {
    renderMealSuggestions(lastMealSuggestions.data);
    return;
  }

  const ingredients = document.getElementById('meal-ingredients').value.trim();
  const ingredientText = ingredients ? `using some or all of these ingredients: ${ingredients}` : 'using common ingredients';
  const cuisineText = selectedCuisine === 'any' ? '' : `${selectedCuisine} cuisine,`;

  document.getElementById('meal-status').style.display = 'flex';
  document.getElementById('meal-suggest-btn').disabled = true;
  document.getElementById('meal-suggestions-result').innerHTML = '';

  try {
    const typeInstruction = selectedMealType === 'meal'
      ? 'Suggest exactly 3 solid meals. No shakes or smoothies whatsoever.'
      : selectedMealType === 'shake'
      ? 'Suggest exactly 3 shakes or smoothies. No solid meals. Only use ingredients that make sense blended: fruits, milk, yogurt, protein powder, oats, nut butter, seeds.'
      : 'Suggest 2 solid meals and 1 shake or smoothie. For the shake, only use ingredients that make sense blended — never put meat, rice, or savory foods in the shake.';

    const prompt = `You are a professional nutritionist. Suggest exactly 3 options for someone targeting ${target} kcal for one meal. ${typeInstruction} ${cuisineText} ${ingredientText}. Each option must be close to ${target} kcal.

    Rules:
    - ingredients must include exact quantities (e.g. "200g chicken breast", "1 cup cooked rice", "1 tbsp olive oil")
    - steps must be clear and specific, not generic
    - calories, protein, carbs, fat must be accurate and realistic
    - all values are for the full meal as described

    Respond ONLY with this JSON array, no markdown, no extra text:
    [
      {"name":"Grilled Chicken & Rice","type":"meal","calories":520,"protein":45,"carbs":52,"fat":11,"time":"25 min","ingredients":["200g chicken breast","1 cup cooked white rice","1 tbsp olive oil","salt and pepper to taste"],"steps":["Season chicken with salt and pepper","Heat oil in pan over medium-high heat","Cook chicken 6 min each side until golden","Serve over rice"]},
      {"name":"Tuna Salad Bowl","type":"meal","calories":480,"protein":38,"carbs":44,"fat":13,"time":"10 min","ingredients":["150g canned tuna in water","1 cup mixed greens","1/2 avocado sliced","1 tbsp lemon juice","1 tsp olive oil"],"steps":["Drain tuna well","Arrange greens in bowl","Top with tuna and avocado","Drizzle with lemon juice and olive oil"]},
      {"name":"Banana Protein Shake","type":"shake","calories":410,"protein":32,"carbs":50,"fat":8,"time":"5 min","ingredients":["1 large banana","250ml whole milk","1 scoop vanilla protein powder","1 tbsp peanut butter","handful of ice"],"steps":["Add all ingredients to blender","Blend on high for 45 seconds until smooth","Pour and serve immediately"]}
    ]`;
    const raw = await callGroq([{ role: 'user', content: prompt }], 5000);
    if (!raw) { showToast('Could not generate suggestions. Try again.'); return; }

    
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No suggestions returned');
    const meals = JSON.parse(match[0]);

    // cache result
    lastMealSuggestions = { target, cuisine: selectedCuisine, type: selectedMealType, data: meals };
    renderMealSuggestions(meals);

  } catch(err) {
    showToast('Could not generate suggestions. Try again.');
    console.error(err);
  } finally {
    document.getElementById('meal-status').style.display = 'none';
    document.getElementById('meal-suggest-btn').disabled = false;
  }
}

function renderMealSuggestions(meals) {
  const wrap = document.getElementById('meal-suggestions-result');
  wrap.innerHTML = meals.map((m, i) => `
    <div class="section-bg" style="margin-bottom:12px;animation:fadeUp 0.3s ease ${i*0.1}s both;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="font-size:1rem;color:var(--green);"><i class="fa-solid ${m.type === 'shake' ? 'fa-blender' : 'fa-bowl-food'}"></i></div>
        <div style="flex:1;">
          <div style="font-weight:700;color:var(--text);font-size:0.92rem;text-transform:capitalize;">${m.name}</div>
          <div style="font-size:0.7rem;color:var(--hint);margin-top:2px;">⏱ ${m.time} · ${m.type === 'shake' ? 'Shake' : 'Meal'}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:1rem;font-weight:800;color:var(--green);font-family:'Fraunces',serif;">${m.calories}</div>
          <div style="font-size:0.6rem;color:var(--hint);">kcal</div>
        </div>
      </div>

      <!-- macros -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
        <div style="background:var(--off2);border-radius:10px;padding:6px;text-align:center;">
          <div style="font-size:0.82rem;font-weight:700;color:var(--text);">${m.carbs}g</div>
          <div style="font-size:0.6rem;color:var(--hint);">Carbs</div>
        </div>
        <div style="background:var(--off2);border-radius:10px;padding:6px;text-align:center;">
          <div style="font-size:0.82rem;font-weight:700;color:var(--text);">${m.protein}g</div>
          <div style="font-size:0.6rem;color:var(--hint);">Protein</div>
        </div>
        <div style="background:var(--off2);border-radius:10px;padding:6px;text-align:center;">
          <div style="font-size:0.82rem;font-weight:700;color:var(--text);">${m.fat}g</div>
          <div style="font-size:0.6rem;color:var(--hint);">Fat</div>
        </div>
      </div>

      <!-- ingredients -->
      <div style="font-size:0.7rem;font-weight:700;color:var(--hint);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Ingredients</div>
      <div style="font-size:0.78rem;color:var(--sub);margin-bottom:10px;">${m.ingredients.join(' · ')}</div>

      <!-- steps -->
      <div style="font-size:0.7rem;font-weight:700;color:var(--hint);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">Steps</div>
      ${m.steps.map((s, i) => `
        <div style="display:flex;gap:8px;margin-bottom:5px;">
          <div style="width:18px;height:18px;border-radius:50%;background:var(--green-l);border:1.5px solid var(--green);display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:700;color:var(--green);flex-shrink:0;">${i+1}</div>
          <div style="font-size:0.78rem;color:var(--sub);line-height:1.5;">${s}</div>
        </div>
      `).join('')}
    </div>
  `).join('');
}


// ══════════════════════════════
// GEOLOCATION
// ══════════════════════════════
function loadDiaryLocation() {
  const el = document.getElementById('diary-location-txt');
  if (!el) return;

  if (!navigator.geolocation) {
    el.textContent = 'Location unavailable';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
        );
        const data = await res.json();
        const city = data.address.city || data.address.town || data.address.village || data.address.county || 'Unknown location';
        const country = data.address.country || '';
        el.textContent = `${city}, ${country}`;
        localStorage.setItem('macrocam_last_location', `${city}, ${country}`);
      } catch (e) {
        const cached = localStorage.getItem('macrocam_last_location');
        el.textContent = cached || 'Location unavailable';
      }
    },
    () => {
      const cached = localStorage.getItem('macrocam_last_location');
      el.textContent = cached || 'Location unavailable';
    },
    { timeout: 8000, maximumAge: 300000 }
  );
}



// ── INIT ──
applyDark();
renderDiary();
loadDiaryLocation();
updateScanCounter();
loadProfile();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}