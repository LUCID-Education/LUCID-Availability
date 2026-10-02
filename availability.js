/*!
 * LUCID Availability – availability.js (studentenpagina)
 * ------------------------------------------------------------------
 * Stap 1  Gegevens (naam + periode) met validatie
 * Stap 2  Per dag een tijdlijn van 96 kwartieren
 *         - penseel: Fysiek / Alleen online / Wissen
 *         - muis: klikken + slepen (Shift+klik = bereik uitbreiden)
 *         - touch: horizontaal slepen, óf tik begin + tik einde
 *         - snelfuncties, kopiëren, "zelfde tijdvak op meerdere dagen", ongedaan maken
 * Stap 3  Samenvatting → download JSON (en optioneel indienen via config.submitEndpoint)
 *
 * Concept wordt automatisch bewaard in localStorage; bij terugkeer wordt eerst
 * gevraagd of het om dezelfde persoon gaat (gedeelde toestellen).
 */
(function () {
  'use strict';

  var core = window.LUCID.core;
  var ui = window.LUCID.ui;
  var cfg = window.LUCID.config || {};
  var el = ui.el, icon = ui.icon;
  var S = core.STATUS, N = core.SLOTS_PER_DAY;

  var DRAFT_KEY = 'lucid.availability.draft.v1';
  var PREFS_KEY = 'lucid.availability.prefs.v1';
  var NIGHT_END = 24;            // slotindex 24 = 06:00
  var HISTORY_LIMIT = 100;
  var BRUSH_LABEL = { 0: 'Wissen', 1: 'Fysiek', 2: 'Alleen online' };

  var state = freshState();
  var brush = S.PHYSICAL;
  var undoStack = [], redoStack = [];
  var views = {};                // datum → { card, slotEls[], statsEl, chipsEl }
  var layoutKey = '';
  var drag = null;               // actieve sleepactie
  var pendingTap = null;         // touch: eerste tik (begin van bereik)
  var lastClick = null;          // voor Shift+klik
  var previewEls = [];
  var lockedPeriod = null;       // {start,end} uit de uitnodigingslink
  var prefs = ui.storage.get(PREFS_KEY) || {};
  var tip;
  var lastRange = { from: 36, to: 68 }; // 09:00 – 17:00

  function freshState() {
    return { firstName: '', lastName: '', start: '', end: '', dates: [], slots: {}, step: 1, completed: false };
  }
  function $(id) { return document.getElementById(id); }

  /* =====================================================================
   * Initialisatie
   * ===================================================================== */
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    tip = ui.floatTip();
    readUrlPeriod();
    bindStep1();
    bindStep2();
    bindStep3();
    bindDialogs();

    var draft = loadDraft();
    if (draft) {
      $('resumeName').textContent = (draft.firstName + ' ' + draft.lastName).trim() || 'onbekend';
      $('resumeWhen').textContent = 'laatst bewaard ' + relativeTime(draft.savedAt);
      $('resumeBanner').hidden = false;
      setStepIndicator(1);
      $('resumeYes').addEventListener('click', function () {
        $('resumeBanner').hidden = true;
        restoreDraft(draft);
      });
      $('resumeNo').addEventListener('click', function () {
        $('resumeBanner').hidden = true;
        wipeDraft();
        resetForm();
        showStep(1);
        ui.toast('De vorige gegevens zijn gewist.', { icon: 'trash' });
      });
    } else {
      showStep(1);
    }
  }

  function readUrlPeriod() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    var s = params.get('start'), e2 = params.get('end');
    if (core.isValidISODate(s) && core.isValidISODate(e2) && core.diffDays(s, e2) >= 0 &&
      core.diffDays(s, e2) + 1 <= core.MAX_PERIOD_DAYS) {
      lockedPeriod = { start: s, end: e2 };
      $('startDate').value = s; $('endDate').value = e2;
      $('startDate').readOnly = true; $('endDate').readOnly = true;
      $('periodLocked').hidden = false;
      $('periodQuick').hidden = true;
    }
  }

  /* =====================================================================
   * Stappen
   * ===================================================================== */
  function setStepIndicator(n) {
    document.querySelectorAll('#steps li').forEach(function (li) {
      var s = +li.dataset.step;
      li.classList.toggle('done', s < n);
      if (s === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
  }

  function showStep(n) {
    state.step = n;
    ['step1', 'step2', 'step3'].forEach(function (id, i) { $(id).hidden = (i + 1 !== n); });
    setStepIndicator(n);
    if (n === 1) updatePeriodInfo();
    if (n === 2) buildPlanner(true);
    if (n === 3) renderReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (n >= 2) saveDraft();
  }

  /* =====================================================================
   * STAP 1 – gegevens
   * ===================================================================== */
  function bindStep1() {
    var form = $('detailsForm');
    form.addEventListener('submit', function (e) { e.preventDefault(); submitStep1(); });
    ['firstName', 'lastName', 'startDate', 'endDate'].forEach(function (id) {
      $(id).addEventListener('input', function () { setFieldError(id, ''); updatePeriodInfo(); });
    });
    document.querySelectorAll('[data-quick]').forEach(function (b) {
      b.addEventListener('click', function () { quickPeriod(b.dataset.quick); });
    });
    $('importFile').addEventListener('change', importOwnFile);
  }

  function quickPeriod(kind) {
    var today = core.todayBrussels();
    var wd = core.isoWeekday(today);
    var start, end;
    if (kind === 'thisweek') { start = today; end = core.addDays(today, 7 - wd); }
    else if (kind === 'nextweek') { start = core.addDays(today, 8 - wd); end = core.addDays(start, 6); }
    else { start = today; end = core.addDays(today, 13); }
    $('startDate').value = start; $('endDate').value = end;
    setFieldError('startDate', ''); setFieldError('endDate', '');
    updatePeriodInfo();
  }

  function updatePeriodInfo() {
    var s = $('startDate').value, e = $('endDate').value, info = $('periodInfo');
    if (core.isValidISODate(s) && core.isValidISODate(e) && core.diffDays(s, e) >= 0) {
      var n = core.diffDays(s, e) + 1;
      info.textContent = n + (n === 1 ? ' dag' : ' dagen') + ' · ' + core.formatDateShort(s) + ' t/m ' + core.formatDateShort(e) + ' ' + core.parseISODate(e).y;
    } else info.textContent = '';
  }

  function setFieldError(id, msg) {
    var input = $(id), err = $(id + '-err');
    if (err) err.textContent = msg;
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }

  function validateStep1() {
    var errors = {};
    var fn = core.cleanName($('firstName').value), ln = core.cleanName($('lastName').value);
    var s = $('startDate').value, e = $('endDate').value;
    if (!fn) errors.firstName = 'Vul je voornaam in.';
    if (!ln) errors.lastName = 'Vul je familienaam in.';
    if (!s) errors.startDate = 'Kies een startdatum.';
    else if (!core.isValidISODate(s)) errors.startDate = 'Ongeldige datum.';
    if (!e) errors.endDate = 'Kies een einddatum.';
    else if (!core.isValidISODate(e)) errors.endDate = 'Ongeldige datum.';
    if (!errors.startDate && !errors.endDate) {
      var n = core.diffDays(s, e) + 1;
      var today = core.todayBrussels();
      if (n < 1) errors.endDate = 'De einddatum ligt vóór de startdatum.';
      else if (n > core.MAX_PERIOD_DAYS) errors.endDate = 'De periode is te lang (' + n + ' dagen). Kies maximaal ' + core.MAX_PERIOD_DAYS + ' dagen.';
      else if (e < today) errors.endDate = 'Deze periode ligt volledig in het verleden.';
      else if (core.diffDays(today, s) > 400) errors.startDate = 'De startdatum ligt meer dan een jaar in de toekomst.';
    }
    return { errors: errors, firstName: fn, lastName: ln, start: s, end: e };
  }

  function submitStep1() {
    var v = validateStep1();
    var ids = ['firstName', 'lastName', 'startDate', 'endDate'];
    ids.forEach(function (id) { setFieldError(id, v.errors[id] || ''); });
    var firstBad = ids.filter(function (id) { return v.errors[id]; })[0];
    if (firstBad) { $(firstBad).focus(); return; }

    var newDates = core.dateRange(v.start, v.end);
    var lost = state.dates.filter(function (d) { return newDates.indexOf(d) < 0 && dayHasData(d); });
    var proceed = lost.length
      ? ui.confirmDialog({
        title: 'Periode wijzigen?',
        body: lost.length + (lost.length === 1 ? ' dag' : ' dagen') + ' met ingevulde beschikbaarheid ' + (lost.length === 1 ? 'valt' : 'vallen') +
          ' buiten de nieuwe periode en ' + (lost.length === 1 ? 'wordt' : 'worden') + ' verwijderd.',
        okText: 'Periode wijzigen', danger: true
      })
      : Promise.resolve(true);
    proceed.then(function (okay) {
      if (!okay) return;
      if (lost.length) pushHistory();
      applyDetails(v.firstName, v.lastName, v.start, v.end);
      state.completed = false;
      showStep(2);
    });
  }

  function applyDetails(fn, ln, start, end) {
    state.firstName = fn; state.lastName = ln;
    state.start = start; state.end = end;
    state.dates = core.dateRange(start, end);
    var slots = {};
    state.dates.forEach(function (d) {
      var arr = state.slots[d] ? new Uint8Array(state.slots[d]) : core.emptyDay();
      var b = core.blockedSlots(d);
      for (var i = 0; i < N; i++) if (b[i]) arr[i] = S.UNAVAILABLE;
      slots[d] = arr;
    });
    state.slots = slots;
  }

  function resetForm() {
    state = freshState();
    undoStack = []; redoStack = [];
    $('detailsForm').reset();
    if (lockedPeriod) { $('startDate').value = lockedPeriod.start; $('endDate').value = lockedPeriod.end; }
    updateUndoButtons();
  }

  /** Eigen, eerder gedownload bestand opnieuw openen om aan te passen. */
  function importOwnFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > core.MAX_FILE_BYTES) { ui.toast('Dit bestand is te groot.', { icon: 'alert' }); return; }
    file.text().then(function (text) {
      var res = core.parseAndValidate(text);
      if (!res.ok) {
        ui.confirmDialog({ title: 'Bestand kan niet geopend worden', body: res.errors.join(' '), okText: 'OK' });
        return;
      }
      var d = res.data;
      if (core.diffDays(d.start, d.end) + 1 > core.MAX_PERIOD_DAYS) {
        ui.confirmDialog({ title: 'Periode te lang', body: 'Dit bestand beslaat meer dan ' + core.MAX_PERIOD_DAYS + ' dagen en kan hier niet bewerkt worden.', okText: 'OK' });
        return;
      }
      $('firstName').value = d.firstName; $('lastName').value = d.lastName;
      if (!lockedPeriod) { $('startDate').value = d.start; $('endDate').value = d.end; }
      state.slots = {};
      d.covered.forEach(function (iso) { state.slots[iso] = new Uint8Array(d.slots[iso]); });
      var start = lockedPeriod ? lockedPeriod.start : d.start, end = lockedPeriod ? lockedPeriod.end : d.end;
      applyDetails(d.firstName, d.lastName, start, end);
      undoStack = []; redoStack = []; updateUndoButtons();
      state.completed = false;
      ui.toast('Bestand van ' + d.fullName + ' geopend.', { icon: 'file' });
      showStep(2);
    }).catch(function () { ui.toast('Het bestand kon niet gelezen worden.', { icon: 'alert' }); });
  }

  /* =====================================================================
   * STAP 2 – tijdlijnen
   * ===================================================================== */
  function bindStep2() {
    document.querySelectorAll('.brush button').forEach(function (b) {
      b.addEventListener('click', function () { setBrush(+b.dataset.brush); });
    });
    $('undoBtn').addEventListener('click', undo);
    $('redoBtn').addEventListener('click', redo);
    $('backTo1').addEventListener('click', function () { fillStep1Form(); showStep(1); });
    $('toReview').addEventListener('click', function () { cancelPending(); showStep(3); });
    $('bulkFillBtn').addEventListener('click', function () { openRangeDialog(null); });
    $('clearAllBtn').addEventListener('click', function () {
      if (!state.dates.some(dayHasData)) { ui.toast('Er is nog niets ingevuld.', { icon: 'info' }); return; }
      ui.confirmDialog({ title: 'Alles wissen?', body: 'Alle aangeduide beschikbaarheid in deze periode wordt gewist. Je kan dit ongedaan maken.', okText: 'Alles wissen', danger: true })
        .then(function (okay) {
          if (!okay) return;
          pushHistory();
          state.dates.forEach(function (d) { state.slots[d] = core.emptyDay(); });
          renderAllDays(); saveDraft();
          ui.toast('Alles gewist.', { icon: 'trash', actionLabel: 'Ongedaan maken', onAction: undo });
        });
    });
    $('hideNight').checked = !!prefs.hideNight;
    $('hideNight').addEventListener('change', function () {
      prefs.hideNight = this.checked; ui.storage.set(PREFS_KEY, prefs);
      buildPlanner(true);
    });

    var list = $('dayList');
    list.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    list.addEventListener('pointerleave', function (e) { if (!drag && e.pointerType === 'mouse') tip.hide(); });
    list.addEventListener('contextmenu', function (e) { if (e.target.closest('.tl-track')) e.preventDefault(); });

    document.addEventListener('keydown', onKeyDown);
    var t = null;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { if (state.step === 2) buildPlanner(false); }, 150);
    });
  }

  function fillStep1Form() {
    $('firstName').value = state.firstName; $('lastName').value = state.lastName;
    if (!lockedPeriod) { $('startDate').value = state.start; $('endDate').value = state.end; }
  }

  function setBrush(v) {
    brush = v;
    document.querySelectorAll('.brush button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(+b.dataset.brush === v));
    });
    if (pendingTap) previewRange(pendingTap.date, pendingTap.i, pendingTap.i);
  }

  function isCoarse() { return window.matchMedia && window.matchMedia('(pointer: coarse)').matches; }

  /** Bepaalt hoeveel uur per rij getoond wordt, afhankelijk van de schermbreedte. */
  function computeLayout() {
    var vs = $('hideNight').checked ? NIGHT_END : 0;
    var visibleHours = (N - vs) / 4;
    var width = Math.max(240, $('dayList').clientWidth - 40);
    var minSlotPx = isCoarse() ? 12 : 8;
    var maxHours = Math.max(1, Math.floor(width / (minSlotPx * 4)));
    var rows = Math.ceil(visibleHours / maxHours);
    var perRow = Math.ceil(visibleHours / rows);
    return { vs: vs, perRow: perRow, rows: rows, key: vs + '|' + perRow };
  }

  function buildPlanner(force) {
    var layout = computeLayout();
    if (!force && layout.key === layoutKey) return;
    layoutKey = layout.key;
    cancelPending();
    var list = $('dayList');
    ui.clear(list);
    views = {};
    state.dates.forEach(function (d, idx) { list.appendChild(createDayCard(d, idx, layout)); renderDay(d); });
    $('plannerHintText').textContent = isCoarse()
      ? 'Kies Fysiek, Online of Wissen. Sleep met je vinger horizontaal over een tijdlijn, of tik op het eerste en daarna op het laatste kwartier van een tijdvak.'
      : 'Kies Fysiek, Online of Wissen en sleep over een tijdlijn om meerdere kwartieren tegelijk te markeren. Eén klik zet of verwijdert één kwartier; Shift+klik breidt uit vanaf je vorige klik.';
    updateUndoButtons();
  }

  function createDayCard(date, idx, layout) {
    var wd = core.isoWeekday(date);
    var card = el('section', { class: 'day-card' + (wd >= 6 ? ' weekend' : ''), dataset: { date: date }, attrs: { 'aria-label': core.formatDateLong(date) } });
    var statsEl = el('div', { class: 'day-stats' });

    var moreMenu = el('details', { class: 'menu' }, [
      el('summary', { class: 'btn btn-ghost btn-sm', attrs: { 'aria-label': 'Meer acties voor ' + core.formatDateLong(date) } }, [icon('more'), el('span', { class: 'long', text: 'Hele dag' })]),
      el('div', { class: 'menu-pop', attrs: { role: 'menu' } }, [
        menuItem('Hele dag fysiek', 'user', function () { fillDay(date, S.PHYSICAL); }),
        menuItem('Hele dag online', 'laptop', function () { fillDay(date, S.ONLINE); }),
        menuItem('Dag wissen', 'eraser', function () { fillDay(date, S.UNAVAILABLE); })
      ])
    ]);

    var head = el('div', { class: 'day-head' }, [
      el('div', { class: 'day-title' }, [el('h3', { text: core.formatDateLong(date) }), statsEl]),
      el('div', { class: 'day-actions' }, [
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', title: 'Een tijdvak met begin- en einduur toevoegen', onclick: function () { openRangeDialog(date); } }, [icon('plus'), 'Tijdvak']),
        idx > 0 ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', title: 'Neem de invulling van ' + core.formatDateShort(state.dates[idx - 1]) + ' over', onclick: function () { copyPrevious(date); } }, [icon('copy'), 'Vorige dag kopiëren']) : null,
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: function () { openCopyDialog(date); } }, [icon('copy'), 'Kopieer naar…']),
        moreMenu
      ])
    ]);

    var tl = el('div', { class: 'tl' });
    var slotEls = new Array(N);
    var blocked = core.blockedSlots(date);
    for (var r = 0; r < layout.rows; r++) {
      var from = layout.vs + r * layout.perRow * 4;
      var to = Math.min(N, from + layout.perRow * 4);
      if (from >= N) break;
      var cols = layout.perRow * 4;
      var ruler = el('div', { class: 'tl-ruler', style: { '--cols': cols }, attrs: { 'aria-hidden': 'true' } });
      for (var h = from; h < to; h += 4) ruler.appendChild(el('span', { text: core.slotToTime(h) }));
      var track = el('div', {
        class: 'tl-track', style: { '--cols': cols }, dataset: { date: date },
        attrs: { role: 'group', 'aria-label': 'Tijdlijn ' + core.slotToTime(from) + ' tot ' + core.slotToTime(to) + '. Gebruik de knop Tijdvak om met het toetsenbord in te vullen.' }
      });
      for (var i = from; i < to; i++) {
        var cls = 'slot' + (i % 4 === 0 && i !== from ? ' h' : '') + (blocked[i] ? ' blk' : '');
        var s = el('div', { class: cls, dataset: { i: i } });
        slotEls[i] = s;
        track.appendChild(s);
      }
      tl.appendChild(el('div', { class: 'tl-row' }, [ruler, track]));
    }

    var chipsEl = el('div', { class: 'day-intervals', attrs: { 'aria-live': 'polite' } });
    card.appendChild(head);
    card.appendChild(tl);
    card.appendChild(chipsEl);
    if (core.hasBlockedSlots(date)) {
      card.appendChild(el('div', { class: 'dst-note' }, [icon('clock'),
        el('span', { text: 'Klokwissel op deze dag: 02:00–03:00 is niet selecteerbaar, omdat dat uur ' + (blocked[8] === core.BLOCK.NONEXISTENT ? 'niet bestaat' : 'twee keer voorkomt') + '.' })]));
    }
    views[date] = { card: card, slotEls: slotEls, statsEl: statsEl, chipsEl: chipsEl };
    return card;
  }

  function menuItem(label, ic, fn) {
    return el('button', {
      type: 'button', class: 'menu-item', attrs: { role: 'menuitem' },
      onclick: function (e) { var d = e.currentTarget.closest('details'); if (d) d.open = false; fn(); }
    }, [icon(ic), label]);
  }

  // Sluit open menu's bij klik erbuiten
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.menu[open]').forEach(function (d) { if (!d.contains(e.target)) d.open = false; });
  });

  function renderAllDays() { state.dates.forEach(renderDay); updateUndoButtons(); }

  function renderDay(date) {
    var v = views[date];
    if (!v) return;
    var arr = state.slots[date];
    for (var i = 0; i < N; i++) {
      var s = v.slotEls[i];
      if (!s) continue;
      s.classList.toggle('s1', arr[i] === S.PHYSICAL);
      s.classList.toggle('s2', arr[i] === S.ONLINE);
    }
    // Statistieken
    var t = core.computeTotals({ x: arr }, ['x']);
    ui.clear(v.statsEl);
    if (t.physicalMinutes) v.statsEl.appendChild(el('span', { class: 'badge badge-physical' }, [icon('user'), core.formatDuration(t.physicalMinutes)]));
    if (t.onlineMinutes) v.statsEl.appendChild(el('span', { class: 'badge badge-online' }, [icon('laptop'), core.formatDuration(t.onlineMinutes)]));
    // Tijdvakken als chips (met verwijderknop) – ook een tekstueel, toegankelijk overzicht
    ui.clear(v.chipsEl);
    var intervals = core.slotsToIntervals(arr);
    if (!intervals.length) {
      v.chipsEl.appendChild(el('span', { class: 'empty', text: 'Niet beschikbaar. Sleep over de tijdlijn of gebruik + Tijdvak.' }));
      return;
    }
    intervals.forEach(function (it) {
      var phys = it.status === 'physical';
      var a = core.timeToSlot(it.start), b = core.timeToSlot(it.end, true);
      v.chipsEl.appendChild(el('span', { class: 'chip ' + (phys ? 'chip-physical' : 'chip-online') }, [
        el('span', { class: 'sw ' + (phys ? 'sw-1' : 'sw-2'), style: { width: '12px', height: '12px' } }),
        el('span', { class: 'tabular', text: it.start + '–' + it.end }),
        el('span', { text: phys ? 'Fysiek' : 'Online' }),
        el('button', {
          class: 'x', type: 'button', attrs: { 'aria-label': 'Verwijder ' + it.start + '–' + it.end + ' op ' + core.formatDateLong(date) },
          onclick: function () { setRange(date, a, b - 1, S.UNAVAILABLE); ui.toast('Tijdvak ' + it.start + '–' + it.end + ' verwijderd.', { icon: 'trash', actionLabel: 'Ongedaan maken', onAction: undo }); }
        }, icon('x'))
      ]));
    });
  }

  function dayHasData(d) {
    var arr = state.slots[d];
    if (!arr) return false;
    for (var i = 0; i < N; i++) if (arr[i]) return true;
    return false;
  }

  /* ---------- Bewerken ---------- */
  /** Zet slots lo…hi (inclusief) op status. Geeft true als er iets veranderde. */
  function setRange(date, lo, hi, status, skipHistory) {
    var arr = state.slots[date], blocked = core.blockedSlots(date);
    var changed = false;
    for (var i = lo; i <= hi; i++) if (!blocked[i] && arr[i] !== status) { changed = true; break; }
    if (!changed) return false;
    if (!skipHistory) pushHistory();
    for (var j = lo; j <= hi; j++) if (!blocked[j]) arr[j] = status;
    renderDay(date);
    saveDraft();
    return true;
  }

  function commitRange(date, a, b, single) {
    var lo = Math.min(a, b), hi = Math.max(a, b);
    var arr = state.slots[date];
    var target = brush;
    if (single && brush !== S.UNAVAILABLE && arr[lo] === brush) target = S.UNAVAILABLE; // klik op zelfde kleur = uitzetten
    var changed = setRange(date, lo, hi, target);
    lastClick = { date: date, i: b };
    setLive(changed ? '✓ ' + core.formatSlotRange(lo, hi + 1) + ' · ' + (target === S.UNAVAILABLE ? 'gewist' : BRUSH_LABEL[target]) : 'Geen wijziging', !!changed);
  }

  function fillDay(date, status) {
    if (setRange(date, 0, N - 1, status)) {
      ui.toast(core.formatDateShort(date) + ': ' + (status === S.PHYSICAL ? 'hele dag fysiek' : status === S.ONLINE ? 'hele dag online' : 'gewist'),
        { icon: 'check', actionLabel: 'Ongedaan maken', onAction: undo });
    }
  }

  function copyDay(src, targets) {
    pushHistory();
    targets.forEach(function (t) {
      var b = core.blockedSlots(t);
      var arr = new Uint8Array(state.slots[src]);
      for (var i = 0; i < N; i++) if (b[i]) arr[i] = S.UNAVAILABLE;
      state.slots[t] = arr;
      renderDay(t);
    });
    saveDraft();
  }

  function copyPrevious(date) {
    var idx = state.dates.indexOf(date);
    if (idx < 1) return;
    var prev = state.dates[idx - 1];
    copyDay(prev, [date]);
    ui.toast(core.formatDateShort(prev) + ' gekopieerd naar ' + core.formatDateShort(date), { icon: 'copy', actionLabel: 'Ongedaan maken', onAction: undo });
  }

  /* ---------- Ongedaan maken / opnieuw ---------- */
  function encodeDay(arr) { return Array.prototype.join.call(arr, ''); }
  function decodeDay(str) {
    if (typeof str !== 'string' || str.length !== N || /[^012]/.test(str)) return null;
    var arr = new Uint8Array(N);
    for (var i = 0; i < N; i++) arr[i] = str.charCodeAt(i) - 48;
    return arr;
  }
  function snapshot() {
    var o = {};
    state.dates.forEach(function (d) { o[d] = encodeDay(state.slots[d]); });
    return o;
  }
  function restore(snap) {
    state.dates.forEach(function (d) { state.slots[d] = (snap[d] && decodeDay(snap[d])) || core.emptyDay(); });
    renderAllDays(); saveDraft();
  }
  function pushHistory() {
    undoStack.push(snapshot());
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
    updateUndoButtons();
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    setLive('Ongedaan gemaakt', true);
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    setLive('Opnieuw uitgevoerd', true);
  }
  function updateUndoButtons() {
    $('undoBtn').disabled = !undoStack.length;
    $('redoBtn').disabled = !redoStack.length;
  }

  /* ---------- Aanwijzer-interactie (muis, pen, touch) ---------- */
  function slotFromEvent(target) {
    var s = target && target.closest ? target.closest('.slot') : null;
    if (!s) return null;
    var track = s.parentNode;
    return { el: s, date: track.dataset.date, i: +s.dataset.i, blocked: s.classList.contains('blk') };
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button > 0) return;
    var hit = slotFromEvent(e.target);
    if (!hit) return;
    if (hit.blocked) { ui.toast('Dit kwartier valt in het uur van de klokwissel en kan niet gekozen worden.', { icon: 'clock' }); return; }
    tip.hide();
    if (e.pointerType === 'touch') {
      // Nog niet beslissen: verticaal = scrollen, horizontaal = slepen, geen beweging = tik.
      drag = { date: hit.date, anchor: hit.i, cur: hit.i, x: e.clientX, y: e.clientY, mode: 'pending', id: e.pointerId };
      return;
    }
    e.preventDefault();
    cancelPending();
    var anchor = (e.shiftKey && lastClick && lastClick.date === hit.date) ? lastClick.i : hit.i;
    drag = { date: hit.date, anchor: anchor, cur: hit.i, x: e.clientX, y: e.clientY, mode: 'drag', id: e.pointerId, moved: anchor !== hit.i };
    previewRange(drag.date, drag.anchor, drag.cur, e.clientX, e.clientY);
  }

  function onPointerMove(e) {
    if (!drag) {
      if (e.pointerType === 'mouse' && state.step === 2 && !pendingTap) hoverTip(e);
      return;
    }
    if (e.pointerId !== drag.id) return;
    if (drag.mode === 'pending') {
      var dx = Math.abs(e.clientX - drag.x), dy = Math.abs(e.clientY - drag.y);
      if (dx > 8 && dx > dy) { drag.mode = 'drag'; cancelPending(); }
      else if (dy > 10) { drag = null; return; }  // gebruiker scrolt
      else return;
    }
    var t = document.elementFromPoint(e.clientX, e.clientY);
    var hit = slotFromEvent(t);
    if (hit && hit.date === drag.date) {
      if (hit.i !== drag.cur) { drag.cur = hit.i; drag.moved = true; }
    }
    previewRange(drag.date, drag.anchor, drag.cur, e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag;
    drag = null;
    if (d.mode === 'pending') { handleTap(d.date, d.anchor); return; }
    clearPreview(); tip.hide();
    commitRange(d.date, d.anchor, d.cur, !d.moved && d.anchor === d.cur);
  }

  function onPointerCancel(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    if (!pendingTap) clearPreview();
    tip.hide();
  }

  /** Touch: eerste tik = begin, tweede tik (zelfde dag) = einde. */
  function handleTap(date, i) {
    if (pendingTap && pendingTap.date === date) {
      var a = pendingTap.i;
      pendingTap = null;
      clearPreview(); tip.hide();
      commitRange(date, a, i, a === i);
      return;
    }
    pendingTap = { date: date, i: i };
    previewRange(date, i, i);
    var r = views[date].slotEls[i].getBoundingClientRect();
    tip.show(r.left + r.width / 2, r.top, 'Begin ' + core.slotToTime(i), 'Tik nu op het laatste kwartier');
    setLive('Begin ' + core.slotToTime(i) + ': tik op het laatste kwartier', true);
  }

  function cancelPending() {
    if (pendingTap) { pendingTap = null; setLive('Sleep over de tijdlijn', false); }
    clearPreview();
    if (tip) tip.hide();
  }

  function previewRange(date, a, b, x, y) {
    clearPreview();
    var v = views[date];
    if (!v) return;
    var lo = Math.min(a, b), hi = Math.max(a, b);
    for (var i = lo; i <= hi; i++) {
      var s = v.slotEls[i];
      if (!s || s.classList.contains('blk')) continue;
      s.classList.add('pv', 'pv-' + brush);
      if (i === lo || !v.slotEls[i - 1]) s.classList.add('pv-first');
      if (i === hi || !v.slotEls[i + 1]) s.classList.add('pv-last');
      previewEls.push(s);
    }
    var label = core.formatSlotRange(lo, hi + 1);
    var sub = BRUSH_LABEL[brush] + ' · ' + core.formatDuration((hi - lo + 1) * core.SLOT_MINUTES);
    setLive(label + ' · ' + BRUSH_LABEL[brush], true);
    if (x !== undefined) tip.show(x, y - (isCoarse() ? 40 : 6), label, sub, true);
  }

  function clearPreview() {
    previewEls.forEach(function (s) { s.classList.remove('pv', 'pv-0', 'pv-1', 'pv-2', 'pv-first', 'pv-last'); });
    previewEls = [];
  }

  function hoverTip(e) {
    var hit = slotFromEvent(e.target);
    if (!hit) { tip.hide(); return; }
    var r = hit.el.getBoundingClientRect();
    var st = state.slots[hit.date][hit.i];
    var sub = hit.blocked ? 'Klokwissel: niet selecteerbaar' : core.STATUS_LABELS[st];
    tip.show(r.left + r.width / 2, r.top, core.formatSlotRange(hit.i, hit.i + 1), sub);
  }

  function setLive(text, active) {
    $('selectionText').textContent = text;
    $('selectionLive').classList.toggle('active', !!active);
  }

  function onKeyDown(e) {
    if (state.step !== 2) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || document.querySelector('dialog[open]')) return;
    var mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
    if (mod || e.altKey) return;
    if (e.key === '1') setBrush(S.PHYSICAL);
    else if (e.key === '2') setBrush(S.ONLINE);
    else if (e.key === '3') setBrush(S.UNAVAILABLE);
    else if (e.key === 'Escape') { drag = null; cancelPending(); }
  }

  /* =====================================================================
   * Dialogen: tijdvak op meerdere dagen & kopiëren
   * ===================================================================== */
  function bindDialogs() {
    var from = $('rdFrom'), to = $('rdTo');
    for (var i = 0; i < N; i++) from.appendChild(el('option', { value: String(i), text: core.slotToTime(i) }));
    for (var j = 1; j <= N; j++) to.appendChild(el('option', { value: String(j), text: core.slotToTime(j) }));
    $('rdCancel').addEventListener('click', function () { $('rangeDialog').close(); });
    $('cpCancel').addEventListener('click', function () { $('copyDialog').close(); });
    $('rangeForm').addEventListener('submit', applyRangeDialog);
    $('copyForm').addEventListener('submit', applyCopyDialog);
  }

  function dayCheckboxes(container, name, checkedFn, excludeDate) {
    ui.clear(container);
    state.dates.forEach(function (d) {
      if (d === excludeDate) return;
      container.appendChild(el('label', { class: 'check' }, [
        el('input', { type: 'checkbox', name: name, value: d, checked: !!checkedFn(d) }),
        el('span', { text: core.formatDateShort(d) })
      ]));
    });
  }

  function quickButtons(container, list, name) {
    ui.clear(container);
    var defs = [
      ['Alle', function () { return true; }],
      ['Werkdagen', function (d) { return core.isoWeekday(d) <= 5; }],
      ['Weekend', function (d) { return core.isoWeekday(d) >= 6; }],
      ['Geen', function () { return false; }]
    ].concat(list || []);
    defs.forEach(function (def) {
      container.appendChild(el('button', {
        type: 'button', class: 'btn btn-sm', text: def[0],
        onclick: function () {
          container.parentNode.querySelectorAll('input[name="' + name + '"]').forEach(function (cb) { cb.checked = def[1](cb.value); });
        }
      }));
    });
  }

  function openRangeDialog(date) {
    $('rd-title').textContent = date ? 'Tijdvak toevoegen' : 'Zelfde tijdvak op meerdere dagen';
    $('rdFrom').value = String(lastRange.from);
    $('rdTo').value = String(lastRange.to);
    document.querySelectorAll('input[name="rdStatus"]').forEach(function (r) { r.checked = +r.value === brush; });
    $('rdError').textContent = '';
    dayCheckboxes($('rdDays'), 'rdDay', function (d) { return date ? d === date : core.isoWeekday(d) <= 5; });
    quickButtons($('rdQuick'), null, 'rdDay');
    $('rangeDialog').showModal();
    $('rdFrom').focus();
  }

  function applyRangeDialog(e) {
    e.preventDefault();
    var a = +$('rdFrom').value, b = +$('rdTo').value;
    var status = +(document.querySelector('input[name="rdStatus"]:checked') || { value: 1 }).value;
    var days = Array.prototype.map.call(document.querySelectorAll('input[name="rdDay"]:checked'), function (cb) { return cb.value; });
    if (b <= a) { $('rdError').textContent = 'Het einduur moet na het beginuur liggen.'; return; }
    if (!days.length) { $('rdError').textContent = 'Kies minstens één dag.'; return; }
    pushHistory();
    days.forEach(function (d) { setRange(d, a, b - 1, status, true); });
    lastRange = { from: a, to: b };
    $('rangeDialog').close();
    ui.toast(core.formatSlotRange(a, b) + ' · ' + BRUSH_LABEL[status] + ' op ' + days.length + (days.length === 1 ? ' dag' : ' dagen'),
      { icon: 'check', actionLabel: 'Ongedaan maken', onAction: undo });
  }

  var copySource = null;
  function openCopyDialog(date) {
    copySource = date;
    $('cp-title').textContent = 'Kopieer ' + core.formatDateShort(date) + ' naar…';
    var iv = core.slotsToIntervals(state.slots[date]);
    $('cpInfo').textContent = iv.length
      ? 'Invulling: ' + iv.map(function (x) { return x.start + '–' + x.end + ' (' + (x.status === 'physical' ? 'fysiek' : 'online') + ')'; }).join(', ')
      : 'Deze dag is leeg. Kopiëren maakt de gekozen dagen dus ook leeg.';
    $('cpError').textContent = '';
    var wd = core.isoWeekday(date);
    dayCheckboxes($('cpDays'), 'cpDay', function () { return false; }, date);
    quickButtons($('cpQuick'), [['Zelfde weekdag', function (d) { return core.isoWeekday(d) === wd; }]], 'cpDay');
    $('copyDialog').showModal();
  }

  function applyCopyDialog(e) {
    e.preventDefault();
    var days = Array.prototype.map.call(document.querySelectorAll('input[name="cpDay"]:checked'), function (cb) { return cb.value; });
    if (!days.length) { $('cpError').textContent = 'Kies minstens één dag.'; return; }
    copyDay(copySource, days);
    $('copyDialog').close();
    ui.toast(core.formatDateShort(copySource) + ' gekopieerd naar ' + days.length + (days.length === 1 ? ' dag' : ' dagen'),
      { icon: 'copy', actionLabel: 'Ongedaan maken', onAction: undo });
  }

  /* =====================================================================
   * STAP 3 – controleren & indienen
   * ===================================================================== */
  function bindStep3() {
    $('backTo2').addEventListener('click', function () { showStep(2); });
    $('editAgain').addEventListener('click', function () { $('doneCard').hidden = true; $('reviewCard').hidden = false; showStep(2); });
    $('downloadBtn').addEventListener('click', doDownload);
    $('downloadAgain').addEventListener('click', doDownload);
    $('submitBtn').addEventListener('click', doSubmit);
    $('wipeBtn').addEventListener('click', function () {
      ui.confirmDialog({ title: 'Gegevens wissen?', body: 'Je naam en beschikbaarheid worden van dit toestel verwijderd. Je gedownloade bestand blijft bestaan.', okText: 'Wissen', danger: true })
        .then(function (okay) {
          if (!okay) return;
          wipeDraft(); resetForm();
          $('doneCard').hidden = true; $('reviewCard').hidden = false;
          showStep(1);
          ui.toast('Je gegevens zijn van dit toestel gewist.', { icon: 'trash' });
        });
    });
    if (cfg.submitEndpoint) { $('submitBtn').hidden = false; $('submitInfo').hidden = false; }
    else $('downloadBtn').className = 'btn btn-primary btn-lg'; // downloaden is dan de hoofdactie
  }

  function renderReview() {
    $('doneCard').hidden = true; $('reviewCard').hidden = false;
    var totals = core.computeTotals(state.slots, state.dates);
    $('rvName').textContent = state.firstName + ' ' + state.lastName;
    $('rvPeriod').textContent = core.formatPeriod(state.start, state.end);
    $('rvDays').textContent = String(state.dates.length);
    $('rvFilled').textContent = String(totals.daysWithAvailability);
    $('rvPhys').textContent = core.formatDuration(totals.physicalMinutes);
    $('rvOnline').textContent = core.formatDuration(totals.onlineMinutes);

    var warn = $('rvWarnings');
    ui.clear(warn);
    if (totals.physicalMinutes + totals.onlineMinutes === 0) {
      warn.appendChild(el('div', { class: 'alert alert-warn' }, [icon('alert'), el('div', {}, [
        el('strong', { text: 'Je hebt nog geen beschikbaarheid aangeduid. ' }),
        'Je bestand zegt dan dat je in deze hele periode niet beschikbaar bent. Klopt dat niet? Ga terug om aan te passen.'])]));
    } else {
      var empty = state.dates.length - totals.daysWithAvailability;
      if (empty > 0) {
        warn.appendChild(el('div', { class: 'alert alert-info' }, [icon('info'), el('div', {
          text: empty + (empty === 1 ? ' dag is' : ' dagen zijn') + ' volledig "niet beschikbaar". Als dat klopt, hoef je niets te doen.'
        })]));
      }
    }

    var list = $('rvDaysList');
    ui.clear(list);
    state.dates.forEach(function (d) {
      var arr = state.slots[d];
      var bar = el('div', { class: 'bar', attrs: { 'aria-hidden': 'true' } });
      for (var i = 0; i < N; i++) bar.appendChild(el('i', { class: arr[i] === S.PHYSICAL ? 's1' : arr[i] === S.ONLINE ? 's2' : '' }));
      var t = core.computeTotals({ x: arr }, ['x']);
      var txt = (t.physicalMinutes ? 'F ' + core.formatDuration(t.physicalMinutes) : '') +
        (t.physicalMinutes && t.onlineMinutes ? ' · ' : '') + (t.onlineMinutes ? 'O ' + core.formatDuration(t.onlineMinutes) : '');
      var iv = core.slotsToIntervals(arr).map(function (x) { return x.start + '–' + x.end + ' ' + (x.status === 'physical' ? 'fysiek' : 'online'); }).join(', ');
      list.appendChild(el('div', { class: 'mini-day', attrs: { title: iv || 'Niet beschikbaar' } }, [
        el('span', { text: core.formatDateShort(d) }), bar,
        el('span', { class: 'tot', text: txt || 'niet beschikbaar' }),
        el('span', { class: 'visually-hidden', text: iv || 'Niet beschikbaar' })
      ]));
    });
  }

  function currentDocument() {
    return core.buildDocument({ firstName: state.firstName, lastName: state.lastName, start: state.start, end: state.end, slots: state.slots });
  }

  function doDownload() {
    var doc = currentDocument();
    var filename = core.buildFilename(state.firstName, state.lastName, state.start, state.end);
    // Extra zekerheid: het document moet onze eigen validatie doorstaan.
    var check = core.validateDocument(JSON.parse(JSON.stringify(doc)));
    if (!check.ok) { ui.confirmDialog({ title: 'Er ging iets mis', body: check.errors.join(' '), okText: 'OK' }); return; }
    ui.downloadText(filename, JSON.stringify(doc, null, 2) + '\n');
    state.completed = true; saveDraft();
    showDone('download', filename);
  }

  function doSubmit() {
    if (!cfg.submitEndpoint) return;
    var btn = $('submitBtn');
    var doc = currentDocument();
    var filename = core.buildFilename(state.firstName, state.lastName, state.start, state.end);
    btn.disabled = true;
    var label = btn.lastChild.textContent;
    btn.lastChild.textContent = ' Bezig met indienen…';
    var controller = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 20000);
    // text/plain = "simple request": geen CORS-preflight nodig (vereist door Google Apps Script).
    fetch(cfg.submitEndpoint, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ type: 'lucid-availability-submission', filename: filename, document: doc }),
      signal: controller ? controller.signal : undefined
    }).then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res || res.ok !== true) throw new Error((res && res.error) || 'Onbekende fout');
        state.completed = true; saveDraft();
        showDone('submit', filename);
      })
      .catch(function () {
        ui.confirmDialog({
          title: 'Indienen is niet gelukt',
          body: 'Je beschikbaarheid kon niet verzonden worden (geen verbinding of de dienst is tijdelijk niet bereikbaar). Download het bestand en stuur het per e-mail naar ' + cfg.contactEmail + '.',
          okText: 'Bestand downloaden', cancelText: 'Sluiten'
        }).then(function (okay) { if (okay) doDownload(); });
      })
      .then(function () { clearTimeout(timer); btn.disabled = false; btn.lastChild.textContent = label; });
  }

  function showDone(kind, filename) {
    $('reviewCard').hidden = true;
    var card = $('doneCard');
    card.hidden = false;
    $('doneFilename').textContent = filename;
    var email = cfg.contactEmail || '';
    $('doneEmail').textContent = email;
    var submitted = kind === 'submit';
    $('doneTitle').textContent = submitted ? 'Je beschikbaarheid is ingediend' : 'Je bestand is gedownload';
    $('doneSteps').hidden = submitted || !email;
    $('mailtoBtn').hidden = submitted || !email;
    var name = state.firstName + ' ' + state.lastName;
    var subject = 'Beschikbaarheid ' + name + ' (' + core.formatPeriod(state.start, state.end) + ')';
    var body = 'Beste coördinator,\n\nIn bijlage vind je mijn beschikbaarheid voor ' + core.formatPeriod(state.start, state.end) +
      '.\n\nBestand: ' + filename + '\n\n(Vergeet niet het bestand toe te voegen als bijlage.)\n\nMet vriendelijke groeten,\n' + name;
    $('mailtoBtn').href = 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    card.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* =====================================================================
   * Concept bewaren (localStorage)
   * ===================================================================== */
  function saveDraft() {
    if (!state.firstName && !state.lastName) return;
    var slots = {};
    state.dates.forEach(function (d) { slots[d] = encodeDay(state.slots[d]); });
    ui.storage.set(DRAFT_KEY, {
      v: 1, savedAt: Date.now(), step: state.step, completed: state.completed,
      firstName: state.firstName, lastName: state.lastName, start: state.start, end: state.end, slots: slots
    });
  }

  function loadDraft() {
    var d = ui.storage.get(DRAFT_KEY);
    if (!d || d.v !== 1) return null;
    var maxAge = (cfg.draftMaxAgeDays || 7) * 86400000;
    if (!d.savedAt || Date.now() - d.savedAt > maxAge ||
      !core.isValidISODate(d.start) || !core.isValidISODate(d.end) || core.diffDays(d.start, d.end) < 0 ||
      core.diffDays(d.start, d.end) + 1 > core.MAX_PERIOD_DAYS) {
      wipeDraft();
      return null;
    }
    return d;
  }

  function restoreDraft(d) {
    state = freshState();
    var slots = {};
    Object.keys(d.slots || {}).forEach(function (k) { var arr = decodeDay(d.slots[k]); if (arr && core.isValidISODate(k)) slots[k] = arr; });
    state.slots = slots;
    var start = d.start, end = d.end;
    if (lockedPeriod && (lockedPeriod.start !== d.start || lockedPeriod.end !== d.end)) {
      start = lockedPeriod.start; end = lockedPeriod.end;
      ui.toast('De periode werd aangepast aan je uitnodigingslink.', { icon: 'calendar' });
    }
    applyDetails(core.cleanName(d.firstName), core.cleanName(d.lastName), start, end);
    state.completed = !!d.completed;
    fillStep1Form();
    showStep(d.step === 3 ? 3 : 2);
  }

  function wipeDraft() { ui.storage.remove(DRAFT_KEY); }

  function relativeTime(ms) {
    var diff = Math.max(0, Date.now() - ms) / 60000;
    if (diff < 1) return 'zonet';
    if (diff < 60) return Math.round(diff) + ' min geleden';
    if (diff < 60 * 24) return Math.round(diff / 60) + ' uur geleden';
    return Math.round(diff / 1440) + ' dagen geleden';
  }
})();
