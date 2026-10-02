/*!
 * LUCID Availability – ui.js
 * Kleine, gedeelde UI-hulpmiddelen (browser-only):
 *   - veilige DOM-opbouw zonder innerHTML met gebruikersdata
 *   - SVG-iconen
 *   - toasts, bevestigingsdialoog, zwevend label
 *   - veilige localStorage-toegang en bestandsdownload
 */
(function (root) {
  'use strict';

  /* ---------- Iconen (vaste, eigen SVG-paden; geen externe bron) ---------- */
  var ICONS = {
    user: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20.5c.8-3.7 3.6-6 7-6s6.2 2.3 7 6"/>',
    laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19.5h20"/>',
    eraser: '<path d="M7 20h13"/><path d="M4.6 14.6 13.8 5.4a2 2 0 0 1 2.8 0l2.4 2.4a2 2 0 0 1 0 2.8L11 19H7.2l-2.6-2.6a1.3 1.3 0 0 1 0-1.8z"/><path d="m9.5 10.5 5 5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    upload: '<path d="M12 15V4"/><path d="m7 8.5 5-5 5 5"/><path d="M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
    download: '<path d="M12 4v11"/><path d="m7 10.5 5 5 5-5"/><path d="M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V6A2 2 0 0 0 13.5 4H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4M12 17.2v.1"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.1"/>',
    shield: '<path d="M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6.5L20.5 7"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    file: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5c.6-3.2 3-5.2 6-5.2s5.4 2 6 5.2"/><path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2M18 14.6c1.6.7 2.7 2.4 3 4.9"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    grid: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4.2l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4-.2l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
    send: '<path d="M21 3 10.5 13.5"/><path d="M21 3 14.5 21l-4-7.5L3 9.5z"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    sparkle: '<path d="M12 3.5 13.8 9 19.5 10.5 13.8 12 12 17.5 10.2 12 4.5 10.5 10.2 9z"/><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>'
  };
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function injectIcons() {
    if (document.getElementById('lucid-icons')) return;
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('id', 'lucid-icons');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.display = 'none';
    var markup = '';
    Object.keys(ICONS).forEach(function (k) { markup += '<symbol id="i-' + k + '" viewBox="0 0 24 24">' + ICONS[k] + '</symbol>'; });
    // Enkel vaste, in de code gedefinieerde SVG – geen gebruikersinput.
    svg.innerHTML = markup;
    document.body.insertBefore(svg, document.body.firstChild);
  }

  function icon(name, extraClass) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icon' + (extraClass ? ' ' + extraClass : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  /** Vervang <i data-icon="naam"></i> placeholders in de HTML door SVG-iconen. */
  function hydrateIcons(scope) {
    (scope || document).querySelectorAll('i[data-icon]').forEach(function (i) {
      i.replaceWith(icon(i.getAttribute('data-icon'), i.getAttribute('class')));
    });
  }

  /**
   * Veilige element-fabriek. Tekst wordt altijd als textContent gezet.
   * el('button', {class:'btn', type:'button', onclick: fn, dataset:{x:1}, attrs:{'aria-label':'…'}}, ['tekst', childNode])
   */
  function el(tag, props, children) {
    var node = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
      else if (k === 'attrs') Object.keys(v).forEach(function (a) { if (v[a] !== null && v[a] !== undefined && v[a] !== false) node.setAttribute(a, v[a] === true ? '' : v[a]); });
      else if (k === 'style') Object.keys(v).forEach(function (s) { node.style.setProperty(s, v[s]); });
      else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k in node) node[k] = v;
      else node.setAttribute(k, v);
    });
    append(node, children);
    return node;
  }
  function append(node, children) {
    if (children === undefined || children === null || children === false) return node;
    if (!Array.isArray(children)) children = [children];
    children.forEach(function (c) {
      if (c === undefined || c === null || c === false) return;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  /* ---------- Toasts ---------- */
  var toastRegion = null;
  function toast(message, opts) {
    opts = opts || {};
    if (!toastRegion) {
      toastRegion = el('div', { class: 'toast-region', attrs: { role: 'status', 'aria-live': 'polite' } });
      document.body.appendChild(toastRegion);
    }
    var t = el('div', { class: 'toast' }, [icon(opts.icon || 'check'), el('span', { text: message })]);
    if (opts.actionLabel && opts.onAction) {
      t.appendChild(el('button', { class: 'btn', type: 'button', text: opts.actionLabel, onclick: function () { opts.onAction(); dismiss(); } }));
    }
    toastRegion.appendChild(t);
    var timer = setTimeout(dismiss, opts.duration || 3200);
    function dismiss() {
      clearTimeout(timer);
      if (!t.parentNode) return;
      t.classList.add('leaving');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 230);
    }
    return dismiss;
  }

  /* ---------- Bevestigingsdialoog ---------- */
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var dlg = el('dialog', { class: 'modal', attrs: { 'aria-labelledby': 'cd-title' } });
      var body = el('div', { class: 'modal-body' });
      append(body, typeof opts.body === 'string' ? el('p', { text: opts.body }) : opts.body);
      var okBtn = el('button', { class: 'btn ' + (opts.danger ? 'btn-dark' : 'btn-primary'), type: 'button', text: opts.okText || 'Bevestigen' });
      var cancelBtn = el('button', { class: 'btn', type: 'button', text: opts.cancelText || 'Annuleren' });
      append(dlg, [
        el('div', { class: 'modal-head' }, el('h2', { id: 'cd-title', text: opts.title || 'Bevestigen' })),
        body,
        el('div', { class: 'modal-foot' }, [cancelBtn, okBtn])
      ]);
      document.body.appendChild(dlg);
      var done = false;
      function finish(v) { if (done) return; done = true; try { dlg.close(); } catch (e) { /* */ } dlg.remove(); resolve(v); }
      okBtn.addEventListener('click', function () { finish(true); });
      cancelBtn.addEventListener('click', function () { finish(false); });
      dlg.addEventListener('cancel', function (e) { e.preventDefault(); finish(false); });
      dlg.addEventListener('click', function (e) { if (e.target === dlg) finish(false); });
      if (typeof dlg.showModal === 'function') dlg.showModal(); else resolve(window.confirm((opts.title || '') + '\n\n' + (typeof opts.body === 'string' ? opts.body : '')));
      (opts.danger ? cancelBtn : okBtn).focus();
    });
  }

  /* ---------- Zwevend label (tooltip / sleeplabel) ---------- */
  var tip = null;
  function floatTip() {
    if (!tip) {
      tip = el('div', { class: 'float-tip', attrs: { 'aria-hidden': 'true' } });
      document.body.appendChild(tip);
    }
    return {
      show: function (x, y, main, sub, big) {
        clear(tip);
        tip.appendChild(document.createTextNode(main));
        if (sub) tip.appendChild(el('span', { class: 'sub', text: sub }));
        tip.classList.toggle('big', !!big);
        var w = tip.offsetWidth || 120;
        var minX = w / 2 + 8, maxX = window.innerWidth - w / 2 - 8;
        tip.style.left = Math.max(minX, Math.min(maxX, x)) + 'px';
        tip.style.top = Math.max(y, 56) + 'px';
        tip.classList.add('show');
      },
      hide: function () { tip.classList.remove('show'); }
    };
  }

  /* ---------- Opslag (kan geblokkeerd zijn: privémodus, policies …) ---------- */
  var storage = {
    get: function (key) { try { var v = window.localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set: function (key, val) { try { window.localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } },
    remove: function (key) { try { window.localStorage.removeItem(key); } catch (e) { /* */ } }
  };

  /* ---------- Bestand downloaden ---------- */
  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: filename, attrs: { hidden: true } });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = el('textarea', { value: text, attrs: { readonly: true }, style: { position: 'fixed', top: '-1000px' } });
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy')); } catch (e) { reject(e); }
      ta.remove();
    });
  }

  root.LUCID = root.LUCID || {};
  root.LUCID.ui = {
    injectIcons: injectIcons, icon: icon, hydrateIcons: hydrateIcons, el: el, append: append, clear: clear,
    toast: toast, confirmDialog: confirmDialog, floatTip: floatTip, storage: storage,
    downloadText: downloadText, copyText: copyText
  };

  document.addEventListener('DOMContentLoaded', function () {
    injectIcons();
    hydrateIcons();
    var y = document.getElementById('year');
    if (y) y.textContent = String(new Date().getFullYear());
  });
})(window);
