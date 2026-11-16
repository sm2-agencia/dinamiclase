/* =====================================================================
   Amigo secreto · Dinamiclase
   Funciona sin registro y sin servidor:
   - El sorteo se hace en el navegador (con reglas de exclusión).
   - Cada participante recibe un enlace con su resultado dentro del
     fragmento "#…" de la URL. Los navegadores nunca envían el fragmento
     al servidor, así que el resultado no sale del enlace.
   - El contenido va ofuscado para que no se lea en la vista previa del
     enlace (no es cifrado fuerte: quien tenga el enlace lo puede ver).
   - Modo "en este dispositivo" para la clase y tarjetas para imprimir.
   ===================================================================== */
(() => {
  'use strict';

  const DC = window.Dinamiclase;
  const { sfx, shuffle, store, escapeHTML, copyText, parseList } = DC.utils;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const DRAW_KEY = 'amigo-sorteo';
  const RULES_KEY = 'amigo-reglas';
  const LINK_PREFIX = '#v1.';

  /* ------------------------------------------------------------------
     Codificación del enlace (ofuscación con semilla aleatoria)
     ------------------------------------------------------------------ */
  function keystream(seedBytes) {
    let a = (seedBytes[0] | (seedBytes[1] << 8) | (seedBytes[2] << 16) | (seedBytes[3] << 24)) >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) & 0xff;
    };
  }
  const toB64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fromB64url = (str) => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

  function encodePayload(obj) {
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const salt = crypto.getRandomValues(new Uint8Array(4));
    const ks = keystream(salt);
    const out = new Uint8Array(4 + data.length);
    out.set(salt);
    data.forEach((b, i) => { out[4 + i] = b ^ ks(); });
    return toB64url(out);
  }
  function decodePayload(str) {
    const bytes = fromB64url(str);
    const ks = keystream(bytes.slice(0, 4));
    const data = bytes.slice(4).map((b) => b ^ ks());
    return JSON.parse(new TextDecoder().decode(data));
  }

  /* ------------------------------------------------------------------
     Vista de revelación (enlace personal)
     ------------------------------------------------------------------ */
  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  function showReveal(p) {
    $('#organizerView').hidden = true;
    $('#revealView').hidden = false;
    document.title = `${p.e || 'Amigo secreto'} · Dinamiclase`;
    $('#revealEvent').textContent = p.e || 'Amigo secreto';
    $('#revealTitle').textContent = `¡Hola, ${p.g}!`;
    $('#revealName').textContent = p.r;
    const wish = $('#revealWish');
    wish.hidden = !p.w;
    wish.innerHTML = p.w ? `<i class="bi bi-stars" aria-hidden="true"></i> Pista de regalo: <strong>${escapeHTML(p.w)}</strong>` : '';
    const details = [];
    if (p.b) details.push(`<li><i class="bi bi-wallet2" aria-hidden="true"></i> Presupuesto: <strong>${escapeHTML(p.b)}</strong></li>`);
    if (p.d) details.push(`<li><i class="bi bi-calendar-heart" aria-hidden="true"></i> Intercambio: <strong>${escapeHTML(fmtDate(p.d))}</strong></li>`);
    $('#revealDetails').innerHTML = details.join('');
    const msg = $('#revealMsg');
    msg.hidden = !p.m;
    msg.textContent = p.m || '';

    const gift = $('#giftBtn');
    const result = $('#revealResult');
    gift.addEventListener('click', () => {
      gift.classList.add('is-open');
      sfx('win');
      setTimeout(() => {
        gift.hidden = true;
        result.hidden = false;
        const r = $('#revealName').getBoundingClientRect();
        DC.confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2, count: 120 });
      }, DC.reducedMotion() ? 0 : 550);
    });
    $('#hideBtn').addEventListener('click', () => {
      result.hidden = true;
      gift.hidden = false;
      gift.classList.remove('is-open');
    });
  }

  // Si se pega un enlace personal estando ya en la página, solo cambia el "#": se recarga
  const startedAsReveal = location.hash.startsWith(LINK_PREFIX);
  window.addEventListener('hashchange', () => { if (startedAsReveal || location.hash.startsWith(LINK_PREFIX)) location.reload(); });

  if (location.hash.startsWith(LINK_PREFIX)) {
    try {
      const p = decodePayload(location.hash.slice(LINK_PREFIX.length));
      if (!p.g || !p.r) throw new Error('incompleto');
      showReveal(p);
    } catch {
      DC.toast({ title: 'El enlace no es válido', text: 'Puede que se haya copiado incompleto. Pide a quien organiza que te lo envíe de nuevo.', icon: 'bi-exclamation-triangle-fill', theme: 'red', timeout: 9000 });
    }
    return; // en la vista de revelación no se carga el organizador
  }

  /* ------------------------------------------------------------------
     Organizador
     ------------------------------------------------------------------ */
  const peopleEl = $('#people');
  const countEl = $('#peopleCount');
  const ruleA = $('#ruleA');
  const ruleB = $('#ruleB');
  const rulesEl = $('#rules');
  const errorEl = $('#drawError');

  let rules = store.get(RULES_KEY, []) || [];
  let draw = store.get(DRAW_KEY, null);

  const norm = (s) => s.trim().toLocaleLowerCase('es');

  function readPeople() {
    const seen = new Set();
    const list = [];
    const dups = [];
    parseList(peopleEl.value).forEach((line) => {
      const idx = line.indexOf(':');
      const name = (idx >= 0 ? line.slice(0, idx) : line).trim().slice(0, 40);
      const wish = idx >= 0 ? line.slice(idx + 1).trim().slice(0, 120) : '';
      if (!name) return;
      if (seen.has(norm(name))) { dups.push(name); return; }
      seen.add(norm(name));
      list.push({ name, wish });
    });
    return { list, dups };
  }

  function syncPeople() {
    const { list, dups } = readPeople();
    countEl.textContent = `${list.length} ${list.length === 1 ? 'persona' : 'personas'}${dups.length ? ` · ${dups.length} repetido${dups.length > 1 ? 's' : ''}` : ''}`;
    countEl.classList.toggle('is-warn', dups.length > 0);
    const opts = list.map((p) => `<option value="${escapeHTML(p.name)}">${escapeHTML(p.name)}</option>`).join('');
    const a = ruleA.value, b = ruleB.value;
    ruleA.innerHTML = opts;
    ruleB.innerHTML = opts;
    if (list.some((p) => p.name === a)) ruleA.value = a;
    if (list.some((p) => p.name === b)) ruleB.value = b;
    else if (list.length > 1) ruleB.selectedIndex = 1;
    renderRules(list);
  }

  function renderRules(list = readPeople().list) {
    const names = new Set(list.map((p) => norm(p.name)));
    rulesEl.innerHTML = rules.map((r, i) => {
      const valid = names.has(norm(r.a)) && names.has(norm(r.b));
      return `<li class="ams-rule${valid ? '' : ' is-stale'}" title="${valid ? '' : 'Alguna de estas personas ya no está en la lista: la regla no se aplica'}">
        <strong>${escapeHTML(r.a)}</strong> <i class="bi ${r.both ? 'bi-arrow-left-right' : 'bi-arrow-right'}" aria-hidden="true"></i> <strong>${escapeHTML(r.b)}</strong>
        <span class="dc-visually-hidden">${r.both ? 'no se regalan entre sí' : 'no le regala'}</span>
        <button type="button" data-del="${i}" aria-label="Quitar regla"><i class="bi bi-x-lg" aria-hidden="true"></i></button></li>`;
    }).join('');
  }

  $('#addRuleBtn').addEventListener('click', () => {
    const a = ruleA.value, b = ruleB.value;
    if (!a || !b) return;
    if (norm(a) === norm(b)) {
      DC.toast({ title: 'Elige dos personas distintas', icon: 'bi-info-circle-fill', theme: 'red', timeout: 2500 });
      return;
    }
    const both = $('#ruleBoth').checked;
    if (rules.some((r) => (norm(r.a) === norm(a) && norm(r.b) === norm(b)) || (r.both && norm(r.a) === norm(b) && norm(r.b) === norm(a)))) return;
    rules.push({ a, b, both });
    store.set(RULES_KEY, rules);
    renderRules();
    sfx('click');
  });
  rulesEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    rules.splice(Number(b.dataset.del), 1);
    store.set(RULES_KEY, rules);
    renderRules();
  });

  peopleEl.addEventListener('input', syncPeople);
  $('#exampleBtn').addEventListener('click', () => {
    peopleEl.value = 'Ana: libros de aventuras, chocolate\nBruno: juegos de mesa\nCarla: plantas\nDiego: música\nElena: dibujo y acuarelas\nFélix';
    peopleEl.dispatchEvent(new Event('input', { bubbles: true }));
  });
  $('#useListBtn').addEventListener('click', () => {
    const list = store.get('lista-estudiantes', '');
    if (!list || !String(list).trim()) {
      DC.toast({ title: 'Aún no tienes una lista guardada', text: 'Créala en la página de inicio, en «Mi lista».', icon: 'bi-info-circle-fill', theme: 'red' });
      return;
    }
    peopleEl.value = String(list);
    peopleEl.dispatchEvent(new Event('input', { bubbles: true }));
  });

  /* ------------------------------------------------------------------
     Sorteo con reglas (búsqueda con vuelta atrás)
     ------------------------------------------------------------------ */
  function solve(n, forbidden, noMutual) {
    const givers = shuffle([...Array(n).keys()]);
    const target = new Array(n).fill(-1);
    const used = new Array(n).fill(false);
    let steps = 0;
    const LIMIT = 200000;
    function place(k) {
      if (k === n) return true;
      if (++steps > LIMIT) return false;
      const g = givers[k];
      for (const r of shuffle([...Array(n).keys()])) {
        if (r === g || used[r] || forbidden.has(`${g}>${r}`)) continue;
        if (noMutual && n > 2 && target[r] === g) continue;
        target[g] = r; used[r] = true;
        if (place(k + 1)) return true;
        target[g] = -1; used[r] = false;
      }
      return false;
    }
    return place(0) ? target : null;
  }

  function doDraw() {
    errorEl.hidden = true;
    const { list, dups } = readPeople();
    if (dups.length) {
      showError(`Hay nombres repetidos (${dups.join(', ')}). Añade una inicial para distinguirlos, por ejemplo «Ana L.» y «Ana M.».`);
      return;
    }
    if (list.length < 3) { showError('Necesitas al menos 3 participantes.'); return; }
    const idx = new Map(list.map((p, i) => [norm(p.name), i]));
    const forbidden = new Set();
    rules.forEach((r) => {
      const a = idx.get(norm(r.a)), b = idx.get(norm(r.b));
      if (a === undefined || b === undefined) return;
      forbidden.add(`${a}>${b}`);
      if (r.both) forbidden.add(`${b}>${a}`);
    });
    const target = solve(list.length, forbidden, $('#noPairs').checked);
    if (!target) {
      showError('Con estas reglas no hay ninguna forma posible de repartir. Quita alguna regla o desactiva «Evitar regalos cruzados».');
      return;
    }
    draw = {
      id: Date.now().toString(36),
      at: new Date().toISOString(),
      people: list,
      target,
      details: { e: $('#eventName').value.trim(), b: $('#budget').value.trim(), d: $('#date').value, m: $('#message').value.trim() },
      sent: [],
      seen: [],
    };
    store.set(DRAW_KEY, draw);
    renderDraw(true);
    sfx('win');
    const r = $('#stage').getBoundingClientRect();
    DC.confetti({ x: r.left + r.width / 2, y: r.top + 80, count: 90 });
  }
  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    sfx('click');
  }

  /* ------------------------------------------------------------------
     Resultados
     ------------------------------------------------------------------ */
  const baseURL = () => `${location.origin === 'null' ? '' : location.origin}${location.pathname}`;
  function linkFor(i) {
    const p = draw.people[i];
    const r = draw.people[draw.target[i]];
    const d = draw.details;
    const payload = { g: p.name, r: r.name };
    if (r.wish) payload.w = r.wish;
    if (d.e) payload.e = d.e;
    if (d.b) payload.b = d.b;
    if (d.d) payload.d = d.d;
    if (d.m) payload.m = d.m;
    return `${baseURL()}${LINK_PREFIX}${encodePayload(payload)}`;
  }
  // Se generan una vez por sorteo para que el enlace copiado no cambie
  let links = [];
  function messageFor(i) {
    const ev = draw.details.e ? ` «${draw.details.e}»` : '';
    return `¡Hola, ${draw.people[i].name}! 🎁 Este es tu enlace privado del amigo secreto${ev}. Ábrelo cuando nadie esté mirando y no se lo pases a nadie:\n${links[i]}`;
  }

  function renderDraw(fresh = false) {
    const has = Boolean(draw && draw.people?.length);
    $('#resultEmpty').hidden = has;
    $('#resultBox').hidden = !has;
    $('#printBtn').disabled = !has;
    $('#peekBtn').disabled = !has;
    if (!has) return;
    if (fresh || links.length !== draw.people.length) links = draw.links && draw.links.length === draw.people.length ? draw.links : draw.people.map((_, i) => linkFor(i));
    if (!draw.links) { draw.links = links; store.set(DRAW_KEY, draw); }

    const canShare = typeof navigator.share === 'function';
    $('#linkList').innerHTML = draw.people.map((p, i) => `
      <li class="ams-item${draw.sent.includes(i) ? ' is-sent' : ''}" data-i="${i}" style="--i:${i}">
        <span class="ams-item__avatar" aria-hidden="true">${escapeHTML(p.name.charAt(0).toUpperCase())}</span>
        <span class="ams-item__name">${escapeHTML(p.name)}<small>${draw.sent.includes(i) ? '<i class="bi bi-check2-circle"></i> enviado' : 'pendiente'}</small></span>
        <span class="ams-item__actions">
          <a class="dc-icon-btn ams-wa" href="https://wa.me/?text=${encodeURIComponent(messageFor(i))}" target="_blank" rel="noopener" data-send="${i}" title="Enviar por WhatsApp" aria-label="Enviar a ${escapeHTML(p.name)} por WhatsApp"><i class="bi bi-whatsapp" aria-hidden="true"></i></a>
          <a class="dc-icon-btn" href="mailto:?subject=${encodeURIComponent(`Tu amigo secreto${draw.details.e ? ` · ${draw.details.e}` : ''}`)}&body=${encodeURIComponent(messageFor(i))}" data-send="${i}" title="Enviar por correo" aria-label="Enviar a ${escapeHTML(p.name)} por correo"><i class="bi bi-envelope-fill" aria-hidden="true"></i></a>
          ${canShare ? `<button class="dc-icon-btn" type="button" data-share="${i}" title="Compartir" aria-label="Compartir el enlace de ${escapeHTML(p.name)}"><i class="bi bi-share-fill" aria-hidden="true"></i></button>` : ''}
          <button class="dc-icon-btn" type="button" data-copy="${i}" title="Copiar enlace" aria-label="Copiar el enlace de ${escapeHTML(p.name)}"><i class="bi bi-link-45deg" aria-hidden="true"></i></button>
        </span>
      </li>`).join('');

    $('#deviceCards').innerHTML = draw.people.map((p, i) => `
      <li><button class="ams-card${draw.seen.includes(i) ? ' is-seen' : ''}" type="button" data-see="${i}" style="--i:${i}">
        <i class="bi ${draw.seen.includes(i) ? 'bi-check-circle-fill' : 'bi-gift-fill'}" aria-hidden="true"></i>
        <span>${escapeHTML(p.name)}</span>
        <small>${draw.seen.includes(i) ? 'Ya lo vio' : 'Toca para ver'}</small>
      </button></li>`).join('');

    const when = new Date(draw.at);
    const rulesUsed = rules.length ? ` · ${rules.length} regla${rules.length > 1 ? 's' : ''}` : '';
    $('#drawMeta').textContent = `Sorteo de ${draw.people.length} personas${rulesUsed} · ${when.toLocaleDateString('es')} ${when.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
    $('#resTitle').textContent = draw.details.e || 'Resultado';
    buildPrint();
  }

  function markSent(i) {
    if (draw.sent.includes(i)) return;
    draw.sent.push(i);
    store.set(DRAW_KEY, draw);
    const li = $(`.ams-item[data-i="${i}"]`);
    if (li) {
      li.classList.add('is-sent');
      $('small', li).innerHTML = '<i class="bi bi-check2-circle"></i> enviado';
    }
  }

  $('#linkList').addEventListener('click', async (e) => {
    const send = e.target.closest('[data-send]');
    if (send) { markSent(Number(send.dataset.send)); return; }
    const copy = e.target.closest('[data-copy]');
    if (copy) {
      const i = Number(copy.dataset.copy);
      if (await copyText(links[i], { silent: true })) {
        markSent(i);
        DC.toast({ title: `Enlace de ${draw.people[i].name} copiado`, text: 'Pégalo en un mensaje solo para esa persona.', icon: 'bi-clipboard-check-fill', theme: 'green', timeout: 2600 });
      }
      return;
    }
    const share = e.target.closest('[data-share]');
    if (share) {
      const i = Number(share.dataset.share);
      try {
        await navigator.share({ title: 'Tu amigo secreto', text: messageFor(i).replace(links[i], '').trim(), url: links[i] });
        markSent(i);
      } catch { /* cancelado */ }
    }
  });
  $('#copyAllBtn').addEventListener('click', () => {
    copyText(draw.people.map((_, i) => messageFor(i)).join('\n\n— — —\n\n'));
  });

  /* Modo dispositivo */
  const devDialog = $('#deviceDialog');
  let devIndex = -1;
  $('#deviceCards').addEventListener('click', (e) => {
    const b = e.target.closest('[data-see]');
    if (!b) return;
    devIndex = Number(b.dataset.see);
    const p = draw.people[devIndex];
    $('#devName').textContent = `¿Eres ${p.name}?`;
    $('#devAsk').hidden = false;
    $('#devShow').hidden = true;
    devDialog.showModal();
  });
  $('#devYes').addEventListener('click', () => {
    const r = draw.people[draw.target[devIndex]];
    $('#devTarget').textContent = r.name;
    const wish = $('#devWish');
    wish.hidden = !r.wish;
    wish.innerHTML = r.wish ? `<i class="bi bi-stars" aria-hidden="true"></i> Pista de regalo: <strong>${escapeHTML(r.wish)}</strong>` : '';
    $('#devAsk').hidden = true;
    $('#devShow').hidden = false;
    sfx('pop');
    if (!draw.seen.includes(devIndex)) { draw.seen.push(devIndex); store.set(DRAW_KEY, draw); }
  });
  function clearDevice() {
    // borrar el nombre de la pantalla antes de pasar el dispositivo
    $('#devTarget').textContent = '';
    $('#devWish').innerHTML = '';
    if (devIndex >= 0) renderDraw();
    devIndex = -1;
  }
  devDialog.addEventListener('close', clearDevice);

  /* Ver todas */
  const peekDialog = $('#peekDialog');
  $('#peekBtn').addEventListener('click', () => {
    if (!window.confirm('Vas a ver todas las parejas del sorteo. ¿Seguro?')) return;
    $('#peekList').innerHTML = draw.people.map((p, i) => `<li><strong>${escapeHTML(p.name)}</strong> <i class="bi bi-arrow-right" aria-hidden="true"></i> ${escapeHTML(draw.people[draw.target[i]].name)}</li>`).join('');
    peekDialog.showModal();
  });
  const clearPeek = () => { $('#peekList').innerHTML = ''; };
  peekDialog.addEventListener('close', clearPeek);
  const closeDialog = (d) => { d.close(); if (d === devDialog) clearDevice(); else clearPeek(); };
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => closeDialog(b.closest('dialog'))));
  $$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) closeDialog(d); }));

  /* Modos de reparto */
  $$('input[name="reveal"]').forEach((r) => r.addEventListener('change', () => {
    $('#linksMode').hidden = r.value !== 'links';
    $('#deviceMode').hidden = r.value !== 'device';
  }));

  /* Tarjetas para imprimir */
  function buildPrint() {
    const d = draw.details;
    const extra = [d.b && `Presupuesto: ${escapeHTML(d.b)}`, d.d && escapeHTML(fmtDate(d.d))].filter(Boolean).join(' · ');
    $('#printSheet').innerHTML = draw.people.map((p, i) => {
      const r = draw.people[draw.target[i]];
      return `<div class="ams-pcard dc-print-card">
        <div class="ams-pcard__in">
          <span>Tu amigo secreto es</span>
          <strong>${escapeHTML(r.name)}</strong>
          ${r.wish ? `<em>Pista: ${escapeHTML(r.wish)}</em>` : ''}
          ${extra ? `<small>${extra}</small>` : ''}
        </div>
        <div class="ams-pcard__out">
          <span>${escapeHTML(d.e || 'Amigo secreto')}</span>
          <strong>Para: ${escapeHTML(p.name)}</strong>
          <small>✂ Recorta, dobla por la línea y no la abras hasta que estés solo/a</small>
        </div>
      </div>`;
    }).join('');
  }
  $('#printBtn').addEventListener('click', () => {
    document.body.classList.add('ams-printing');
    window.print();
  });
  window.addEventListener('afterprint', () => document.body.classList.remove('ams-printing'));

  $('#drawBtn').addEventListener('click', () => {
    if (draw && draw.sent.length && !window.confirm('Ya enviaste enlaces de un sorteo anterior. Si haces uno nuevo, esos enlaces dejarán de coincidir. ¿Continuar?')) return;
    doDraw();
  });
  $('#newDrawBtn').addEventListener('click', () => $('#drawBtn').click());

  syncPeople();
  renderDraw();
})();
