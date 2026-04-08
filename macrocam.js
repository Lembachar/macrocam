
const CALORIE_GOAL = 1800;
const getCalGoal = () => window.DYNAMIC_CALORIE_GOAL || CALORIE_GOAL;

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

async function callGemini(body) {
  for (const model of GEMINI_MODELS) {
    const res = await fetch('/.netlify/functions/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, payload: body })
    });
    const data = await res.json();
    if (data.error?.code === 429) continue;
    return data;
  }
  return { error: { code: 429, message: 'All models rate limited' } };
}


async function callGroq(messages, maxTokens = 1024) {
  try {
    const res = await fetch('/.netlify/functions/groq', {
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




let currentFood = null;
let imageBase64 = null;
let imageFile = null;
let diary = JSON.parse(localStorage.getItem('nutrisnap_diary') || '[]');
const TODAY = new Date().toDateString();


document.getElementById('today-date').textContent = new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
document.getElementById('diary-date-sub').textContent = 'Today — ' + new Date().toLocaleDateString('en-US', { month:'long', day:'numeric' });


function switchTab(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('screen-' + el.dataset.screen).classList.add('active');
  if (el.dataset.screen === 'diary')     renderDiary();
  if (el.dataset.screen === 'insights') { renderDashboard(); loadDeviceInfo(); loadAIInsight(); analyzeEatingPatterns(); }
  if (el.dataset.screen === 'profile')   loadProfile();
  if (el.dataset.screen === 'meal') { lastMealSuggestions = null; }
  if (el.dataset.screen !== 'scan') { stopBarcodeScanner(); document.getElementById('barcode-section').style.display = 'none'; document.getElementById('barcode-toggle-btn').textContent = '📦 Scan barcode'; }

}

function showResultScreen() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-result').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
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
    const prompt = `Identify this food and return ONLY this JSON with no extra text:\n{\"name\":\"\",\"calories\":0,\"carbs\":0,\"protein\":0,\"fat\":0,\"fiber\":0,\"sugar\":0,\"serving\":\"\",\"ingredients\":[],\"vitaminC\":0,\"iron\":0,\"calcium\":0,\"potassium\":0}\nAll nutrition values must be per 100g. Numbers only, no units in values. For serving write the typical serving size. For ingredients list the main components e.g. [\"chicken\",\"rice\",\"tomato\"]. For vitamins and minerals provide accurate values per 100g: vitaminC in mg, iron in mg, calcium in mg, potassium in mg. If it is a complex meal with more than 3 ingredients set vitaminC, iron, calcium, potassium all to -1.`;

    const data = await callGemini({
      contents: [{
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 800 }
    });
    
    console.log('Gemini response:', JSON.stringify(data));

    // rate limit
    if (data.error?.code === 429) {
      const retryAfter = data.error?.details?.find(d => d.retryDelay)?.retryDelay;
      const secs = retryAfter ? parseInt(retryAfter) : 60;
      document.getElementById('status-bar').classList.remove('show');
      document.getElementById('scan-line').classList.remove('show');
      showToast(`Rate limited — please wait ${secs}s`);
      startCooldown(secs);
      return;
    }

    if (data.error) throw new Error('API error: ' + data.error.message);

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Raw text:', raw);

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
      // last resort: extract key values with regex
      const extract = (key) => {
        const m = raw.match(new RegExp(`"${key}"\\s*:\\s*([\\d.]+)`));
        return m ? parseFloat(m[1]) : 0;
      };
      const nameMatch = raw.match(/"name"\s*:\s*"([^"]+)"/);
      currentFood = {
        name:    nameMatch ? nameMatch[1] : 'Unknown food',
        calories: extract('calories'),
        carbs:    extract('carbs'),
        protein:  extract('protein'),
        fat:      extract('fat'),
        fiber:    extract('fiber'),
        sugar:    extract('sugar'),
        serving:  '1 serving',
        ingredients: []
      };
      if (!currentFood.calories) throw new Error('Could not parse nutrition data');
    }

    document.getElementById('status-bar').classList.remove('show');
    document.getElementById('scan-line').classList.remove('show');
    document.getElementById('analyze-btn').textContent = 'Analyze food';

    showResult(currentFood);
    insightLoaded = false;
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
  if (resetPortion) {
    portionMultiplier = 1;
    portionAmountG = 100;
    selectedUnit = 'g';
    const amountEl = document.getElementById('portion-amount');
    if (amountEl) amountEl.value = 100;
    document.querySelectorAll('.unit-btn[data-unit]').forEach(b => b.classList.toggle('active', b.dataset.unit === 'g'));
    const convEl = document.getElementById('portion-converted');
    if (convEl) convEl.textContent = '100g';
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
  const todayEntries = diary.filter(e => e.date === TODAY);
  const usedKcal    = todayEntries.reduce((s, e) => s + (e.calories || 0), 0);
  const usedCarbs   = todayEntries.reduce((s, e) => s + (e.carbs || 0), 0);
  const usedProtein = todayEntries.reduce((s, e) => s + (e.protein || 0), 0);
  const usedFat     = todayEntries.reduce((s, e) => s + (e.fat || 0), 0);

  const goals = { cal: CALORIE_GOAL, carbs: 250, protein: 50, fat: 70 };
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
    date: TODAY,
    portion: portionMultiplier,
    category: selectedCategory,
    price: price
  };
  diary.unshift(entry);
  localStorage.setItem('nutrisnap_diary', JSON.stringify(diary));

  // check if goal hit — trigger confetti
  const totalAfter = diary.filter(e => e.date === TODAY).reduce((s, e) => s + (e.calories || 0), 0);
  const totalBefore = totalAfter - entry.calories;
  if (totalBefore < CALORIE_GOAL && totalAfter >= CALORIE_GOAL) launchConfetti();

  showToast(`${currentFood.name} logged! ✓`);
  switchTab(document.querySelector('[data-screen="diary"]'));
});


function renderDiary() {
  updateBudgetUI();
  renderProteinDistribution(); 
  const todayEntries = diary.filter(e => e.date === TODAY);
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
  const circ = 2 * Math.PI * 29;
  const dash = (pct / 100) * circ;
  document.getElementById('ring-circle').style.strokeDasharray = `${dash} ${circ - dash}`;

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
  weekGrid.innerHTML = weekHTML;

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

  const todayEntries = diary.filter(e => e.date === TODAY);
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
  box.innerHTML = items.map(item => `
    <div onclick="selectSuggestion('${item.replace(/'/g,"\\'")}') "
      style="padding:11px 14px;font-size:0.82rem;color:var(--text);border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.1s;"
      onmouseover="this.style.background='var(--off)'" onmouseout="this.style.background=''">
      ${item}
    </div>`).join('');
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
let waterConsumed = parseInt(localStorage.getItem('nutrisnap_water_' + TODAY) || '0');

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
  localStorage.setItem('nutrisnap_water_' + TODAY, waterConsumed);
  updateWaterUI();
}

function resetWater() {
  waterConsumed = 0;
  localStorage.setItem('nutrisnap_water_' + TODAY, 0);
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
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const ds = d.toDateString();
    const hasEntry = diary.some(e => e.date === ds);
    if (hasEntry) streak++;
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
  const key = 'nutrisnap_scans_' + TODAY;
  const count = parseInt(localStorage.getItem(key) || '0');
  document.getElementById('scan-count').textContent = count;
}

function incrementScanCounter() {
  const key = 'nutrisnap_scans_' + TODAY;
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
  for (let i = 0; i < 90; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    el.style.cssText = `left:${Math.random()*100}%;background:${colors[Math.floor(Math.random()*colors.length)]};width:${4+Math.random()*8}px;height:${4+Math.random()*8}px;animation-duration:${1.5+Math.random()*2}s;animation-delay:${Math.random()*0.6}s;border-radius:${Math.random()>0.5?'50%':'2px'};`;
    wrap.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
  showToast('🎉 Daily goal reached!');
}


function confirmClearAll() { document.getElementById('clear-modal').classList.add('show'); }
function closeClearModal()  { document.getElementById('clear-modal').classList.remove('show'); }
function clearAllMeals() {
  diary = diary.filter(e => e.date !== TODAY);
  localStorage.setItem('nutrisnap_diary', JSON.stringify(diary));
  closeClearModal();
  renderDiary();
  showToast('All meals cleared');
}
document.getElementById('clear-modal').addEventListener('click', function(e) {
  if (e.target === this) closeClearModal();
});

// ── DIARY SEARCH LIVE FILTER ──
document.getElementById('diary-search').addEventListener('input', renderDiary);

// ══════════════════════════════
// DARK MODE
// ══════════════════════════════
let isDark = localStorage.getItem('nutrisnap_dark') === '1';

function applyDark() {
  document.body.classList.toggle('dark', isDark);
  document.getElementById('dark-toggle').textContent = isDark ? '☀️' : '🌙';
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
    btn.textContent = '❤️';
    btn.classList.add('saved');
    showToast(`${currentFood.name} saved to favorites!`);
  } else {
    favorites.splice(idx, 1);
    btn.textContent = '🤍';
    btn.classList.remove('saved');
    showToast('Removed from favorites');
  }
  localStorage.setItem('nutrisnap_favorites', JSON.stringify(favorites));
}

function updateFavBtn() {
  if (!currentFood) return;
  const btn = document.getElementById('fav-btn');
  const saved = favorites.some(f => f.name.toLowerCase() === currentFood.name.toLowerCase());
  btn.textContent = saved ? '❤️' : '🤍';
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

function renderDashboard() {
  renderCaloriesChart();
  renderMacrosChart();
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
  const todayEntries = diary.filter(e => e.date === TODAY);
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

    const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });

    async function scan() {
      if (!barcodeScanning) return;
      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          const code = barcodes[0].rawValue;
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
  btn.textContent = visible ? '📦 Scan barcode' : '✕ Close barcode';
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
  const todayEntries = diary.filter(e => e.date === TODAY);
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
  const todayEntries = diary.filter(e => e.date === TODAY);
  const wrap = document.getElementById('protein-dist-wrap');
  if (!wrap) return;

  if (!todayEntries.length) {
    wrap.innerHTML = '<div style="font-size:0.78rem;color:var(--hint);text-align:center;padding:8px 0;">Log meals to see protein distribution</div>';
    return;
  }

  const catOrder = ['breakfast','lunch','dinner','snack'];
  const catLabels = { breakfast:'Breakfast', lunch:'Lunch', dinner:'Dinner', snack:'Snack' };
  const totalProtein = todayEntries.reduce((s, e) => s + (e.protein || 0), 0);
  const goal = 50; // default protein goal

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
        <div style="font-size:1.5rem;">${m.type === 'shake' ? '🥤' : '🍽️'}</div>
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






// ── INIT ──
applyDark();
renderDiary();
updateScanCounter();
loadProfile();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}