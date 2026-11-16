/* =====================================================================
   Mecanografía contra reloj · Dinamiclase
   - Pruebas por tiempo (15/30/60/120 s) o por número de palabras
   - Textos en español: palabras comunes, frases, tildes y ñ,
     lecciones por filas del teclado, números y texto propio
   - Opciones: mayúsculas, puntuación, números, sin tildes
   - PPM, precisión, gráfica por segundo, teclas con más fallos y récord
   - Teclado en pantalla con la siguiente tecla resaltada
   ===================================================================== */
(() => {
  'use strict';

  const DC = window.Dinamiclase;
  const { sfx, store, escapeHTML, copyText } = DC.utils;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ------------------------------------------------------------------
     Bancos de texto (propios)
     ------------------------------------------------------------------ */
  const COMUNES = `de la que el en y a los se del las un por con no una su para es al lo como más o pero sus le ya
    fue este ha sí porque esta son entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante
    todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él tanto esa
    estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mi mis tú te ti tu tus ellas
    nosotras vosotros os mío mía míos tuyo tuya suyo nuestro nuestra vuestro esos esas estoy estás está estamos están
    casa día tiempo vida mundo año parte vez forma lugar caso país hombre mujer niño niña escuela clase libro mesa
    agua fuego tierra aire sol luna cielo mar río camino ciudad pueblo calle puerta ventana amigo familia trabajo
    juego idea pregunta respuesta palabra número letra historia ciencia arte música color verde azul rojo blanco
    negro grande pequeño nuevo viejo bueno malo alto bajo largo corto rápido lento fácil difícil feliz claro
    hacer decir poder ir ver dar saber querer llegar pasar deber poner parecer quedar creer hablar llevar dejar
    seguir encontrar llamar venir pensar salir volver tomar conocer vivir sentir tratar mirar contar empezar esperar
    buscar existir entrar trabajar escribir perder producir ocurrir entender pedir recibir recordar terminar
    permitir aparecer conseguir comenzar servir sacar necesitar mantener resultar leer caer cambiar presentar crear
    abrir considerar oír acabar convertir ganar formar traer partir morir aceptar realizar suponer comprender
    hoy ayer mañana siempre nunca ahora luego tarde temprano aquí allí cerca lejos dentro fuera arriba abajo
    mano ojo cabeza corazón voz nombre noche tarde semana mes hora minuto momento final principio grupo equipo`
    .split(/\s+/).filter(Boolean);

  const DIFICILES = `año niño niña señal sueño pequeño montaña compañero mañana español enseñanza diseño otoño cumpleaños
    añadir araña cigüeña pingüino vergüenza lingüística bilingüe agüita camión canción corazón razón lección atención
    árbol fácil difícil útil lápiz césped azúcar cráter mármol ángel álbum música médico página número sábado miércoles
    teléfono matemáticas química física geografía biología pájaro murciélago brújula esdrújula fantástico último
    rápido público océano círculo triángulo práctica gramática plátano película máquina cámara héroe período
    también además quizá jamás según través algún ningún través Perú Panamá Bogotá México Málaga Córdoba Cádiz
    ¿Qué? ¿Cómo? ¿Dónde? ¿Cuándo? ¿Quién? ¿Cuál? ¡Qué! acción reunión exposición evaluación investigación`
    .split(/\s+/).filter(Boolean);

  const FRASES = [
    'Leer un poco cada día hace que las palabras nuevas se queden con nosotros.',
    'El equipo terminó el proyecto antes de la fecha y celebró con una merienda.',
    'Si practicas con calma, la velocidad llega sola y sin errores.',
    'La biblioteca abre temprano para que todos puedan estudiar en silencio.',
    'Mi compañera dibujó un mapa del barrio con calles, ríos y montañas.',
    'Escribir sin mirar el teclado es como andar en bicicleta: se aprende con práctica.',
    'Cada pregunta curiosa es el inicio de un gran descubrimiento.',
    'El sol se escondió detrás de la montaña y el cielo se volvió naranja.',
    'Nuestro huerto escolar tiene tomates, lechugas y un girasol enorme.',
    'Antes de responder, lee la pregunta dos veces y subraya lo importante.',
    'La música suena mejor cuando todo el grupo escucha con atención.',
    'Un buen resumen cuenta lo esencial con pocas palabras y mucha claridad.',
    'El pingüino camina despacio, pero nada rapidísimo bajo el agua fría.',
    'Hoy aprendimos que la Tierra gira alrededor del Sol en un año.',
    'Las ideas crecen cuando se comparten con respeto y buen humor.',
    'Equivocarse también es aprender, siempre que intentemos de nuevo.',
    'En otoño las hojas cambian de color y caen suavemente al suelo.',
    'El cuaderno de ciencias guarda experimentos, dibujos y muchas preguntas.',
    'Para cuidar el planeta, apagamos la luz al salir del salón.',
    '¿Sabías que el corazón late unas cien mil veces cada día?',
    '¡Qué alegría ver a todo el grupo trabajando en equipo!',
    'La profesora propuso un reto: escribir un cuento de diez líneas.',
    'Un mapa conceptual ayuda a ordenar lo que ya sabemos.',
    'El reloj marca las ocho y el patio se llena de risas.',
    'Con una lupa descubrimos que la hoja tiene caminos diminutos.',
    'La paciencia y la constancia convierten lo difícil en fácil.',
    'Mi abuelo cuenta historias de cuando el pueblo no tenía luz eléctrica.',
    'Las matemáticas están en la cocina, en la música y en el deporte.',
    'Guardamos silencio para escuchar el canto de los pájaros.',
    'El volcán de plastilina hizo erupción con bicarbonato y vinagre.',
    'Cada mañana anotamos en la pizarra el clima y la fecha.',
    'Compartir el material es una forma sencilla de cuidar a los demás.',
    'El murciélago se orienta en la oscuridad gracias al eco.',
    'Si te sientes cansado, respira hondo y estira los brazos.',
    'La lectura en voz alta mejora la pronunciación y la confianza.',
    'Los números grandes se leen mejor cuando los separamos en grupos.',
    'Después del recreo, el grupo volvió con energía para seguir aprendiendo.',
    'Una buena pregunta vale más que muchas respuestas memorizadas.',
  ];

  const ROWS = {
    guia: { letters: 'asdfghjklñ', words: 'las sala hada falda gala ala jala salsa dada faja sajada hallada' },
    superior: { letters: 'qwertyuiop', words: 'que tipo pero puerto ropa tropa pito ruta tuyo yeti torre peor quiero tío ríe' },
    inferior: { letters: 'zxcvbnm', words: 'van ven cien mano nube vino cine zumo base cebo nevan comen bomba' },
  };

  const PUNCT_END = [',', ',', '.', '.', ';', ':'];

  /* ------------------------------------------------------------------
     Teclado (distribución española ISO)
     ------------------------------------------------------------------ */
  const KB_ROWS = [
    [['º'], ['1', '!'], ['2', '"'], ['3', '·'], ['4', '$'], ['5', '%'], ['6', '&'], ['7', '/'], ['8', '('], ['9', ')'], ['0', '='], ["'", '?'], ['¡', '¿']],
    [['Tab', null, 'wide'], ['q'], ['w'], ['e'], ['r'], ['t'], ['y'], ['u'], ['i'], ['o'], ['p'], ['`', '^'], ['+', '*']],
    [['Mayús', null, 'wider', 'caps'], ['a'], ['s'], ['d'], ['f'], ['g'], ['h'], ['j'], ['k'], ['l'], ['ñ'], ['´', '¨'], ['ç']],
    [['⇧', null, 'wide', 'shiftL'], ['<', '>'], ['z'], ['x'], ['c'], ['v'], ['b'], ['n'], ['m'], [',', ';'], ['.', ':'], ['-', '_'], ['⇧', null, 'widest', 'shiftR']],
    [['espacio', null, 'space', ' ']],
  ];
  // Dedo por tecla (0 meñique izq. … 3 índice izq., 4 índice der. … 7 meñique der.)
  const FINGER = {
    'º': 0, 1: 0, 2: 1, 3: 2, 4: 3, 5: 3, 6: 4, 7: 4, 8: 5, 9: 6, 0: 7, "'": 7, '¡': 7,
    q: 0, w: 1, e: 2, r: 3, t: 3, y: 4, u: 4, i: 5, o: 6, p: 7, '`': 7, '+': 7,
    a: 0, s: 1, d: 2, f: 3, g: 3, h: 4, j: 4, k: 5, l: 6, 'ñ': 7, '´': 7, 'ç': 7,
    '<': 0, z: 0, x: 1, c: 2, v: 3, b: 3, n: 4, m: 4, ',': 5, '.': 6, '-': 7,
  };
  const SHIFTED = {};
  KB_ROWS.forEach((row) => row.forEach(([base, shift]) => { if (shift) SHIFTED[shift] = base; }));
  const ACUTE = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', Á: 'a', É: 'e', Í: 'i', Ó: 'o', Ú: 'u' };
  const DIAER = { ü: 'u', Ü: 'u' };

  /* ------------------------------------------------------------------
     DOM y estado
     ------------------------------------------------------------------ */
  const stage = $('#stage');
  const wordsEl = $('#words');
  const typingEl = $('#typing');
  const caret = $('#caret');
  const input = $('#typeInput');
  const focusHint = $('#focusHint');
  const kbEl = $('#keyboard');
  const resultsEl = $('#results');
  const contentSel = $('#content');
  const customBox = $('#customBox');
  const customText = $('#customText');
  const opt = { caps: $('#optCaps'), punct: $('#optPunct'), nums: $('#optNums'), noAccents: $('#optNoAccents'), keyboard: $('#optKeyboard') };
  const live = { timer: $('#liveTimer'), timerLabel: $('#liveTimerLabel'), wpm: $('#liveWpm'), acc: $('#liveAcc'), bar: $('#progressBar') };

  let words = [];       // palabras objetivo
  let typed = [];       // lo escrito en cada palabra
  let cur = 0;          // palabra actual
  let wordEls = [];
  let startAt = 0;
  let endAt = 0;
  let running = false;
  let finished = false;
  let tickTimer = 0;
  let keys = { ok: 0, bad: 0 };
  let missByKey = {};
  let history = [];     // [{ s, wpm, raw, err }]
  let errThisSecond = 0;
  let lastSeed = null;  // para "repetir el mismo texto"
  let lineShift = 0;

  const cfg = () => ({
    mode: $('input[name="mode"]:checked').value,
    time: Number($('input[name="time"]:checked').value),
    count: Number($('input[name="count"]:checked').value),
    content: contentSel.value,
  });

  /* ------------------------------------------------------------------
     Generación del texto
     ------------------------------------------------------------------ */
  const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const stripAccents = (w) => w.normalize('NFD').replace(/[́̈̀]/g, '').normalize('NFC');

  function lessonWord(letters, rnd) {
    const len = 2 + Math.floor(rnd() * 4);
    let w = '';
    for (let i = 0; i < len; i++) w += letters[Math.floor(rnd() * letters.length)];
    return w;
  }

  /** Genera n palabras a partir de la posición `from` (para alargar en modo tiempo) */
  function generate(n, rnd, from = 0) {
    const { content } = cfg();
    const out = [];
    if (content === 'frases' || content === 'propio') {
      let source;
      if (content === 'propio') {
        source = customText.value.trim().split(/\s+/).filter(Boolean);
        if (!source.length) source = FRASES[0].split(' ');
        while (out.length < n) { out.push(source[(from + out.length) % source.length]); }
        return out;
      }
      const order = FRASES.map((_, i) => [rnd(), i]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
      let i = 0;
      while (out.length < n) { out.push(...FRASES[order[i % order.length]].split(' ')); i++; }
      return out.slice(0, n);
    }
    let prev = '';
    for (let i = 0; i < n; i++) {
      let w;
      if (content === 'numeros') w = String(Math.floor(rnd() * 10 ** (1 + Math.floor(rnd() * 4))));
      else if (ROWS[content]) {
        const r = ROWS[content];
        w = rnd() < 0.35 ? pick(r.words.split(' '), rnd) : lessonWord(r.letters, rnd);
      } else {
        const list = content === 'dificiles' ? DIFICILES : COMUNES;
        do { w = pick(list, rnd); } while (w === prev && list.length > 1);
      }
      prev = w;
      out.push(w);
    }
    return out;
  }

  /** Aplica mayúsculas, puntuación y números */
  function decorate(list, rnd, startIndex = 0) {
    const { content } = cfg();
    const natural = content === 'frases' || content === 'propio' || content === 'numeros';
    return list.map((w, i) => {
      let x = w;
      if (!natural) {
        if (opt.nums.checked && rnd() < 0.15) x = String(Math.floor(rnd() * 1000));
        if (opt.caps.checked && (rnd() < 0.25 || (startIndex + i) === 0)) x = x.charAt(0).toUpperCase() + x.slice(1);
        if (opt.punct.checked && !/[¿?¡!]/.test(x)) {
          const r = rnd();
          if (r < 0.06) x = `¿${x}?`;
          else if (r < 0.1) x = `¡${x}!`;
          else if (r < 0.3) x += pick(PUNCT_END, rnd);
        }
      }
      if (opt.noAccents.checked) x = stripAccents(x);
      return x;
    });
  }

  /* ------------------------------------------------------------------
     Pintado del texto
     ------------------------------------------------------------------ */
  function wordHTML(i) {
    const target = words[i];
    const t = typed[i] || '';
    let html = '';
    for (let k = 0; k < target.length; k++) {
      let cls = '';
      if (k < t.length) cls = t[k] === target[k] ? 'ok' : 'bad';
      else if (i < cur) cls = 'miss';
      html += `<span class="${cls}">${escapeHTML(target[k])}</span>`;
    }
    for (let k = target.length; k < t.length; k++) html += `<span class="extra">${escapeHTML(t[k])}</span>`;
    return html;
  }
  function paintWord(i) {
    const el = wordEls[i];
    if (!el) return;
    el.innerHTML = wordHTML(i);
    el.classList.toggle('is-error', i < cur && typed[i] !== words[i]);
    el.classList.toggle('is-current', i === cur);
  }
  function renderAll() {
    wordsEl.innerHTML = '';
    wordEls = words.map((_, i) => {
      const el = document.createElement('span');
      el.className = 'mc-word';
      wordsEl.appendChild(el);
      return el;
    });
    wordEls.forEach((_, i) => paintWord(i));
    lineShift = 0;
    wordsEl.style.transform = 'translateY(0)';
    placeCaret(true);
  }
  function appendWords(list) {
    list.forEach((w) => {
      words.push(w);
      const el = document.createElement('span');
      el.className = 'mc-word';
      wordsEl.appendChild(el);
      wordEls.push(el);
      paintWord(words.length - 1);
    });
  }

  function placeCaret(instant) {
    const el = wordEls[cur];
    if (!el) { caret.hidden = true; return; }
    caret.hidden = false;
    const lineH = el.offsetHeight;
    // Desplaza las líneas para que la actual sea siempre la segunda
    const top = el.offsetTop;
    const wanted = Math.max(0, top - lineH * 1.0);
    const lineTop = Math.round(wanted / lineH) * lineH;
    if (lineTop !== lineShift) {
      lineShift = lineTop;
      wordsEl.style.transform = `translateY(${-lineShift}px)`;
    }
    const t = typed[cur] || '';
    const letters = el.children;
    let x;
    if (t.length < letters.length && letters[t.length]) x = el.offsetLeft + letters[t.length].offsetLeft;
    else { const last = letters[letters.length - 1]; x = el.offsetLeft + (last ? last.offsetLeft + last.offsetWidth : 0); }
    caret.classList.toggle('is-instant', Boolean(instant));
    caret.style.transform = `translate(${x}px, ${top - lineShift}px)`;
    caret.style.height = `${lineH}px`;
    highlightKey();
  }

  /* ------------------------------------------------------------------
     Teclado en pantalla
     ------------------------------------------------------------------ */
  function buildKeyboard() {
    kbEl.innerHTML = KB_ROWS.map((row) => `<div class="mc-kb__row">${row.map(([base, shift, size, id]) => {
      const key = id || base;
      const finger = FINGER[base];
      const label = base === 'espacio' ? '' : escapeHTML(base.length === 1 ? base.toUpperCase() : base);
      const top = shift ? `<small>${escapeHTML(shift)}</small>` : '';
      const home = ['f', 'j'].includes(base) ? ' mc-key--home' : '';
      return `<span class="mc-key${size ? ` mc-key--${size}` : ''}${home}" data-key="${escapeHTML(key)}"${finger !== undefined ? ` data-finger="${finger}"` : ''}>${top}${label}</span>`;
    }).join('')}</div>`).join('') + `<p class="mc-kb__legend">
      <span data-finger="0">Meñique</span><span data-finger="1">Anular</span><span data-finger="2">Medio</span><span data-finger="3">Índice</span>
      <span class="mc-kb__legend-sep">mano izquierda · mano derecha</span>
      <span data-finger="4">Índice</span><span data-finger="5">Medio</span><span data-finger="6">Anular</span><span data-finger="7">Meñique</span></p>`;
  }
  function keysFor(ch) {
    if (ch === undefined) return [];
    if (ch === ' ') return [' '];
    if (ACUTE[ch]) return [...keysFor(ACUTE[ch]), '´'];
    if (DIAER[ch]) return [...keysFor(DIAER[ch]), '´', 'shift'];
    if (SHIFTED[ch]) return [SHIFTED[ch], 'shift'];
    const low = ch.toLowerCase();
    if (low !== ch) return [low, 'shift'];
    return [ch];
  }
  function highlightKey() {
    if (kbEl.hidden) return;
    $$('.is-next', kbEl).forEach((k) => k.classList.remove('is-next'));
    if (finished) return;
    const target = words[cur] || '';
    const t = typed[cur] || '';
    const ch = t.length >= target.length ? ' ' : target[t.length];
    const ks = keysFor(ch);
    ks.forEach((k) => {
      if (k === 'shift') {
        // Mayús con la mano contraria a la tecla
        const f = FINGER[ks[0]];
        $(`[data-key="${f !== undefined && f <= 3 ? 'shiftR' : 'shiftL'}"]`, kbEl)?.classList.add('is-next');
        return;
      }
      $$(`[data-key="${CSS.escape(k)}"]`, kbEl).forEach((el) => el.classList.add('is-next'));
    });
  }
  function flashKey(ch, good) {
    const k = keysFor(ch)[0];
    if (!k || kbEl.hidden) return;
    const el = $(`[data-key="${CSS.escape(k)}"]`, kbEl);
    if (!el) return;
    el.classList.remove('is-hit', 'is-miss');
    void el.offsetWidth;
    el.classList.add(good ? 'is-hit' : 'is-miss');
  }

  /* ------------------------------------------------------------------
     Estadísticas
     ------------------------------------------------------------------ */
  function elapsed() {
    if (!startAt) return 0;
    return ((finished ? endAt : performance.now()) - startAt) / 1000;
  }
  function counts() {
    let correct = 0, incorrect = 0, extra = 0, missed = 0, wordChars = 0, rawChars = 0;
    const upto = Math.min(cur, words.length - 1);
    for (let i = 0; i <= upto; i++) {
      const w = words[i], t = typed[i] || '';
      const done = i < cur;
      for (let k = 0; k < Math.max(w.length, t.length); k++) {
        if (k < t.length && k < w.length) { if (t[k] === w[k]) correct++; else incorrect++; }
        else if (k >= w.length) extra++;
        else if (done) missed++;
      }
      rawChars += t.length + (done ? 1 : 0);
      if (done && t === w) wordChars += w.length + 1;
      else if (!done && w.startsWith(t)) wordChars += t.length;
    }
    return { correct, incorrect, extra, missed, wordChars, rawChars };
  }
  function computeStats() {
    const s = Math.max(elapsed(), 0.5);
    const c = counts();
    const wpm = (c.wordChars / 5) / (s / 60);
    const raw = (c.rawChars / 5) / (s / 60);
    const total = keys.ok + keys.bad;
    const acc = total ? (keys.ok / total) * 100 : 100;
    return { ...c, wpm, raw, acc, secs: s };
  }

  function paintLive() {
    const { mode, time, count } = cfg();
    const st = computeStats();
    if (mode === 'time') {
      const left = running ? Math.max(0, time - elapsed()) : time;
      live.timer.textContent = String(Math.ceil(left));
      live.timerLabel.textContent = 'segundos';
      live.bar.style.width = `${running || finished ? Math.min(100, (elapsed() / time) * 100) : 0}%`;
    } else {
      live.timer.textContent = `${Math.min(cur, count)}/${count}`;
      live.timerLabel.textContent = 'palabras';
      live.bar.style.width = `${(Math.min(cur, count) / count) * 100}%`;
    }
    live.wpm.textContent = running ? String(Math.round(st.wpm)) : finished ? String(Math.round(st.wpm)) : '0';
    live.acc.textContent = `${Math.round(st.acc)}%`;
  }

  function tick() {
    if (!running) return;
    const { mode, time } = cfg();
    const s = elapsed();
    const whole = Math.floor(s);
    if (whole > history.length && whole >= 1) {
      const st = computeStats();
      history.push({ s: whole, wpm: st.wpm, raw: st.raw, err: errThisSecond });
      errThisSecond = 0;
    }
    if (mode === 'time') {
      const left = time - s;
      if (left <= 3.05 && left > 0 && Math.ceil(left) !== tick.lastBeep) { tick.lastBeep = Math.ceil(left); sfx('tick'); }
      if (s >= time) { finish(); return; }
    }
    paintLive();
  }

  /* ------------------------------------------------------------------
     Entrada del teclado
     ------------------------------------------------------------------ */
  function startIfNeeded() {
    if (running || finished) return;
    running = true;
    startAt = performance.now();
    tick.lastBeep = null;
    clearInterval(tickTimer);
    tickTimer = setInterval(tick, 100);
    stage.classList.add('is-running');
  }

  function registerChars(prev, next) {
    const target = words[cur];
    // Solo cuenta lo añadido al final (las teclas muertas de las tildes llegan ya compuestas)
    if (next.length <= prev.length || !next.startsWith(prev)) {
      if (next.length > prev.length) {
        for (let k = 0; k < next.length; k++) if (next[k] !== prev[k]) { countKey(next[k], target[k]); break; }
      }
      return;
    }
    for (let k = prev.length; k < next.length; k++) countKey(next[k], target[k]);
  }
  function countKey(ch, expected) {
    if (ch === expected) { keys.ok++; flashKey(ch, true); }
    else {
      keys.bad++;
      errThisSecond++;
      const k = expected === undefined ? '(letras de más)' : expected;
      missByKey[k] = (missByKey[k] || 0) + 1;
      flashKey(ch, false);
    }
  }

  function commitWord(value) {
    const target = words[cur];
    typed[cur] = value;
    if (value === target) keys.ok++; // el espacio cuenta como acierto
    else { keys.bad++; errThisSecond++; if (value.length < target.length) missByKey[target[value.length]] = (missByKey[target[value.length]] || 0) + 1; }
    cur++;
    paintWord(cur - 1);
    const { mode, count } = cfg();
    if (mode === 'words' && cur >= count) { finish(); return; }
    if (mode === 'time' && words.length - cur < 40) {
      const rnd = seeded(Date.now() & 0xffffffff);
      appendWords(decorate(generate(60, rnd, words.length), rnd, words.length));
    }
    paintWord(cur);
    input.value = '';
    placeCaret();
  }

  input.addEventListener('input', () => {
    if (finished) { input.value = ''; return; }
    let val = input.value;
    const prev = typed[cur] || '';
    if (val.includes(' ') || val.includes('\n')) {
      // Puede llegar más de una palabra de golpe (texto pegado o teclados predictivos)
      const parts = val.split(/[ \n]/);
      const rest = parts.pop();
      let before = prev;
      for (const part of parts) {
        if (finished) return;
        if (!part && !before) continue; // espacio sin haber escrito: se ignora
        startIfNeeded();
        registerChars(before, part);
        commitWord(part);
        before = '';
      }
      if (finished) return;
      input.value = rest;
      if (rest) { registerChars('', rest); typed[cur] = rest; paintWord(cur); placeCaret(); }
      if (!checkLastWord()) paintLive();
      return;
    }
    // límite de letras de más
    const target = words[cur];
    if (val.length > target.length + 12) { val = val.slice(0, target.length + 12); input.value = val; }
    startIfNeeded();
    registerChars(prev, val);
    typed[cur] = val;
    paintWord(cur);
    placeCaret();
    if (!checkLastWord()) paintLive();
  });

  /** En modo palabras, la prueba termina al escribir bien la última palabra (sin espacio) */
  function checkLastWord() {
    const { mode, count } = cfg();
    if (mode === 'words' && cur === count - 1 && typed[cur] === words[cur]) { keys.ok++; cur++; finish(); return true; }
    return false;
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); $('#restartBtn').focus(); return; }
    if (e.key === 'Escape') { e.preventDefault(); restart(); return; }
    if (e.key === 'Backspace' && input.value === '' && cur > 0 && typed[cur - 1] !== words[cur - 1] && !finished) {
      // volver a la palabra anterior si tenía errores
      e.preventDefault();
      paintWord(cur);
      cur--;
      input.value = typed[cur];
      paintWord(cur);
      placeCaret();
      return;
    }
  });
  input.addEventListener('focus', () => { typingEl.classList.add('is-focused'); });
  input.addEventListener('blur', () => { typingEl.classList.remove('is-focused'); });
  typingEl.addEventListener('click', () => input.focus());
  focusHint.addEventListener('click', () => input.focus());

  // Cualquier tecla fuera de un campo enfoca la prueba
  document.addEventListener('keydown', (e) => {
    if (e.target === input || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName) && e.key !== 'Escape') return;
    if (e.key === 'Escape') { if (!document.fullscreenElement) restart(); return; }
    if (resultsEl.hidden && e.key.length === 1) {
      const r = typingEl.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) input.focus();
    }
  });

  /* ------------------------------------------------------------------
     Fin de la prueba y resultados
     ------------------------------------------------------------------ */
  function recordKey() {
    const { mode, time, count, content } = cfg();
    const extras = content === 'propio' ? '' : [opt.caps.checked && 'M', opt.punct.checked && 'P', opt.nums.checked && 'N'].filter(Boolean).join('');
    return `meca-record:${mode}-${mode === 'time' ? time : count}-${content}${extras ? `-${extras}` : ''}`;
  }
  function finish() {
    if (finished) return;
    finished = true;
    running = false;
    endAt = performance.now();
    clearInterval(tickTimer);
    stage.classList.remove('is-running');
    input.blur();
    const st = computeStats();
    const secs = elapsed();
    if (secs - history.length > 0.3) history.push({ s: Math.round(secs * 10) / 10, wpm: st.wpm, raw: st.raw, err: errThisSecond });
    paintLive();
    highlightKey();
    caret.hidden = true;
    showResults(st);
  }

  function showResults(st) {
    const wpm = Math.round(st.wpm);
    $('#resWpm').textContent = String(wpm);
    $('#resAcc').textContent = `${Math.round(st.acc)}%`;
    $('#resRaw').textContent = String(Math.round(st.raw));
    $('#resChars').textContent = `${st.correct}/${st.incorrect}/${st.extra}/${st.missed}`;
    $('#resTime').textContent = `${Math.round(st.secs)} s`;

    const key = recordKey();
    const best = Number(store.get(key, 0)) || 0;
    const valid = st.secs >= 5 && st.acc >= 50 && wpm > 0;
    let headline = '¡Prueba terminada!';
    if (valid && wpm > best) {
      store.set(key, wpm);
      $('#resBest').textContent = `${wpm} ppm`;
      headline = best ? `¡Nuevo récord! Superaste tus ${best} ppm` : '¡Primer récord guardado!';
      setTimeout(() => {
        const r = $('#resWpm').getBoundingClientRect();
        DC.confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2, count: 110 });
      }, 250);
      sfx('win');
    } else {
      $('#resBest').textContent = best ? `${best} ppm` : '—';
      if (!valid) headline = 'Prueba demasiado corta o con muchos errores';
      else if (st.acc >= 97) headline = '¡Muy preciso! Ahora intenta ir un poco más rápido';
      else if (st.acc < 90) headline = 'Ve más despacio: la precisión es lo primero';
      sfx('soft');
    }
    $('#resHeadline').textContent = headline;

    const weak = Object.entries(missByKey).sort((a, b) => b[1] - a[1]).slice(0, 8);
    $('#weakBox').hidden = !weak.length;
    $('#weakKeys').innerHTML = weak.map(([k, n]) =>
      `<span class="mc-weak__key"><kbd>${escapeHTML(k === ' ' ? 'espacio' : k)}</kbd><small>${n} ${n === 1 ? 'fallo' : 'fallos'}</small></span>`).join('');

    resultsEl.hidden = false;
    drawChart();
    resultsEl.focus({ preventScroll: true });
    resultsEl.scrollIntoView({ behavior: DC.reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }

  function drawChart() {
    const cv = $('#chart');
    const c = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth || 900;
    const h = cv.clientHeight || 220;
    cv.width = w * dpr;
    cv.height = h * dpr;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    if (!history.length) return;
    const css = getComputedStyle(stage);
    const teal = css.getPropertyValue('--c').trim() || '#14B8A6';
    const ink = css.getPropertyValue('--dc-ink').trim() || '#231942';
    const muted = css.getPropertyValue('--dc-muted').trim() || '#6B6585';
    const pad = { l: 40, r: 14, t: 14, b: 26 };
    const maxS = history[history.length - 1].s;
    const maxV = Math.max(10, ...history.map((p) => Math.max(p.wpm, p.raw))) * 1.15;
    const X = (s) => pad.l + ((s - (history.length > 1 ? history[0].s : 0)) / Math.max(0.0001, maxS - (history.length > 1 ? history[0].s : 0))) * (w - pad.l - pad.r);
    const Y = (v) => h - pad.b - (v / maxV) * (h - pad.t - pad.b);

    c.font = '700 11px Nunito, sans-serif';
    c.fillStyle = muted;
    c.strokeStyle = 'rgba(35,25,66,.1)';
    c.lineWidth = 1;
    const step = maxV > 120 ? 40 : maxV > 60 ? 20 : 10;
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    for (let v = 0; v <= maxV; v += step) {
      c.beginPath(); c.moveTo(pad.l, Y(v)); c.lineTo(w - pad.r, Y(v)); c.stroke();
      c.fillText(String(v), pad.l - 6, Y(v));
    }
    c.textAlign = 'center';
    c.textBaseline = 'top';
    const sStep = maxS > 60 ? 15 : maxS > 20 ? 5 : 1;
    history.forEach((p) => { if (Number.isInteger(p.s) && p.s % sStep === 0) c.fillText(`${p.s}s`, X(p.s), h - pad.b + 6); });

    const line = (key, color, width) => {
      c.beginPath();
      history.forEach((p, i) => (i ? c.lineTo(X(p.s), Y(p[key])) : c.moveTo(X(p.s), Y(p[key]))));
      c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round'; c.stroke();
    };
    line('raw', 'rgba(107,101,133,.45)', 2);
    line('wpm', teal, 3.5);
    if (history.length === 1) {
      c.beginPath(); c.arc(X(history[0].s), Y(history[0].wpm), 4, 0, Math.PI * 2); c.fillStyle = teal; c.fill();
    }
    history.forEach((p) => {
      if (!p.err) return;
      c.fillStyle = '#E11D48';
      c.beginPath(); c.arc(X(p.s), Y(p.wpm), 3 + Math.min(p.err, 4), 0, Math.PI * 2); c.fill();
    });
    c.textAlign = 'left'; c.textBaseline = 'top'; c.fillStyle = ink;
    c.fillText('ppm', 4, 4);
  }

  /* ------------------------------------------------------------------
     Reiniciar
     ------------------------------------------------------------------ */
  function restart({ same = false } = {}) {
    clearInterval(tickTimer);
    running = false;
    finished = false;
    startAt = 0;
    cur = 0;
    typed = [];
    keys = { ok: 0, bad: 0 };
    missByKey = {};
    history = [];
    errThisSecond = 0;
    stage.classList.remove('is-running');
    resultsEl.hidden = true;
    const { mode, count, content } = cfg();
    customBox.hidden = content !== 'propio';
    const seed = same && lastSeed !== null ? lastSeed : Math.floor(Math.random() * 2 ** 31);
    lastSeed = seed;
    const rnd = seeded(seed);
    const n = mode === 'words' ? count : 120;
    words = decorate(generate(n, rnd), rnd);
    if (mode === 'words' && content === 'propio') {
      // con texto propio en modo palabras se usa todo el texto (hasta el límite elegido)
      words = words.slice(0, count);
    }
    input.value = '';
    renderAll();
    paintLive();
    $('#timeOpts').hidden = mode !== 'time';
    $('#wordOpts').hidden = mode !== 'words';
    input.focus({ preventScroll: true });
  }

  $('#restartBtn').addEventListener('click', () => restart());
  $('#againBtn').addEventListener('click', () => restart());
  $('#repeatBtn').addEventListener('click', () => restart({ same: true }));
  $('#copyResBtn').addEventListener('click', () => {
    const { mode, time, count } = cfg();
    const label = contentSel.options[contentSel.selectedIndex].text;
    copyText(`Mecanografía (Dinamiclase) · ${mode === 'time' ? `${time} s` : `${count} palabras`} · ${label}\n`
      + `${$('#resWpm').textContent} ppm · precisión ${$('#resAcc').textContent} · ${$('#resChars').textContent} (correctos/incorrectos/de más/omitidos)`);
  });

  // Configuración
  const PREFS = 'meca-config';
  function savePrefs() {
    const { mode, time, count } = cfg();
    store.set(PREFS, { mode, time, count });
  }
  function loadPrefs() {
    const p = store.get(PREFS, null);
    if (!p) return;
    [['mode', p.mode], ['time', p.time], ['count', p.count]].forEach(([name, v]) => {
      const r = $(`input[name="${name}"][value="${v}"]`);
      if (r) r.checked = true;
    });
  }
  $$('input[name="mode"], input[name="time"], input[name="count"]').forEach((r) => r.addEventListener('change', () => { savePrefs(); restart(); }));
  contentSel.addEventListener('change', () => { restart(); if (contentSel.value === 'propio') customText.focus(); });
  ['caps', 'punct', 'nums', 'noAccents'].forEach((k) => opt[k].addEventListener('change', () => restart()));
  opt.keyboard.addEventListener('change', () => { kbEl.hidden = !opt.keyboard.checked; highlightKey(); });
  let customTimer = 0;
  customText.addEventListener('input', () => { clearTimeout(customTimer); customTimer = setTimeout(() => restart(), 600); });

  // Recolocar el cursor si cambia el tamaño (pantalla completa, giro del móvil…)
  new ResizeObserver(() => placeCaret(true)).observe(wordsEl);
  window.addEventListener('resize', () => { if (!resultsEl.hidden) drawChart(); });

  /* ------------------------------------------------------------------
     Arranque
     ------------------------------------------------------------------ */
  buildKeyboard();
  loadPrefs();
  kbEl.hidden = !opt.keyboard.checked;
  restart();
  input.blur();
  if (document.fonts?.ready) document.fonts.ready.then(() => placeCaret(true));
})();
