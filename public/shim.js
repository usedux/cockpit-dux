/* Cockpit DUX — camada de compatibilidade para a Vercel.
   A página foi escrita para rodar como Artifact do claude.ai (window.claude.use('db'|'user'|'assets'|'downloads')).
   Aqui implementamos a mesma interface falando com as funções /api/* do próprio domínio, e mantemos
   a página sincronizada em tempo (quase) real: coleções e blocos do Linear são consultados com checagem de versão. */
(function () {
  'use strict';
  var POLL_MS = 4000, LIVE_MS = 8000;

  function showStorageBanner(msg) {
    if (document.getElementById('storageBanner') || !document.body) return;
    var b = document.createElement('div'); b.id = 'storageBanner';
    b.style.cssText = 'position:sticky;top:0;z-index:9999;background:#7a1f1f;color:#fff;padding:10px 16px;font:13px/1.45 system-ui,sans-serif;text-align:center';
    b.textContent = 'Atenção: ' + msg;
    document.body.insertBefore(b, document.body.firstChild);
  }
  function goLogin() { location.href = '/auth/login'; }
  async function api(path, opts) {
    var res = await fetch(path, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, opts || {}));
    if (res.status === 401) { goLogin(); throw new Error('não autenticado'); }
    var data = await res.json().catch(function () { return {}; });
    if (res.status === 503 && /Redis/.test(data.error || '')) showStorageBanner(data.error);
    if (!res.ok) { var e = new Error(data.error || ('erro ' + res.status)); e.code = res.status; throw e; }
    return data;
  }
  function post(path, body) {
    return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  var mePromise = null;
  function me() { if (!mePromise) mePromise = api('/auth/me').catch(function () { return null; }); return mePromise; }

  // ----- user -----
  var user = {
    id: async function () { var m = await me(); return m ? m.id : null; },
    isOwner: async function () { var m = await me(); return !!(m && m.isAdmin); },
    canEdit: async function () { var m = await me(); return !!(m && m.isAdmin); },
    can: async function (what) { var m = await me(); return m ? (what === 'data.write' ? true : !!m.isAdmin) : false; },
    me: async function () { var m = await me(); return m ? { id: m.id, name: m.name || '', email: m.email || null } : { id: null, name: '', email: null }; },
    profiles: async function (ids) {
      ids = (ids || []).filter(Boolean);
      if (!ids.length) return {};
      try { return await post('/api/people', { ids: ids }); } catch (e) { return {}; }
    },
    search: async function (q) {
      try { return await api('/api/people?q=' + encodeURIComponent(q || '')); } catch (e) { return []; }
    }
  };

  // ----- db -----
  var watchers = {}; // coleção -> { version, cbs:[{ok,err}], timer }
  function makeSnap(docs) {
    return { docs: docs.map(function (d) { return { id: d.id, data: function () { return d.data; } }; }), size: docs.length, empty: !docs.length };
  }
  async function pull(c, force) {
    var w = watchers[c]; if (!w) return;
    try {
      var out = await api('/api/db?c=' + encodeURIComponent(c) + (!force && w.version !== null ? '&since=' + w.version : ''));
      if (out.unchanged) return;
      w.version = out.version;
      var snap = makeSnap(out.docs || []);
      w.cbs.forEach(function (cb) { try { cb.ok(snap); } catch (e) { console.error(e); } });
    } catch (e) {
      if (w.version === null) w.cbs.forEach(function (cb) { if (cb.err) try { cb.err(e); } catch (x) {} });
    }
  }
  function startPolling() {
    if (startPolling.on) return; startPolling.on = true;
    setInterval(function () { if (document.hidden) return; Object.keys(watchers).forEach(function (c) { pull(c, false); }); }, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { Object.keys(watchers).forEach(function (c) { pull(c, false); }); loadLive(); } });
  }
  var db = {
    collection: function (c) {
      return {
        onSnapshot: function (ok, err) {
          var w = watchers[c] || (watchers[c] = { version: null, cbs: [] });
          var entry = { ok: ok, err: err }; w.cbs.push(entry);
          w.version = null; // garante que o novo ouvinte recebe o estado atual
          pull(c, true); startPolling();
          return function () { w.cbs = w.cbs.filter(function (x) { return x !== entry; }); };
        }
      };
    },
    doc: function (path) {
      var p = String(path).split('/'), c = p[0], id = p.slice(1).join('/');
      function after(r) { if (watchers[c]) pull(c, true); return r; }
      return {
        set: function (data) { return post('/api/db', { op: 'set', c: c, id: id, data: data }).then(after); },
        update: function (data) { return post('/api/db', { op: 'update', c: c, id: id, data: data }).then(after); },
        delete: function () { return post('/api/db', { op: 'delete', c: c, id: id }).then(after); }
      };
    }
  };

  // ----- assets / downloads -----
  var assets = {
    upload: async function (file) {
      if (file.size > 4 * 1024 * 1024) throw new Error('Arquivo acima de 4 MB — use um link (Loom, Drive…) em vez de anexar.');
      var res = await fetch('/api/upload?filename=' + encodeURIComponent(file.name || 'arquivo'), {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file
      });
      var data = await res.json().catch(function () { return {}; });
      if (res.status === 401) goLogin();
      if (!res.ok) throw new Error(data.error || 'Falha no envio do arquivo');
      return { id: data.id, type: data.type, size: data.size, name: file.name };
    }
  };
  var downloads = {
    save: async function (o) {
      var blob = new Blob([o.data], { type: o.type || 'text/plain;charset=utf-8' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = o.filename || 'arquivo.txt';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
  };

  window.claude = { use: async function (name) { return ({ user: user, db: db, assets: assets, downloads: downloads })[name] || null; } };

  // ----- blocos ao vivo (Linear) + histórico semanal -----
  function applyBlock(name, html) {
    var startTxt = ' LIVE:' + name + ':start ', endTxt = ' LIVE:' + name + ':end ';
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT, null);
    var start = null, end = null, n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue === startTxt) start = n;
      else if (start && n.nodeValue === endTxt) { end = n; break; }
    }
    if (!start || !end || start.parentNode !== end.parentNode) return false;
    while (start.nextSibling && start.nextSibling !== end) start.parentNode.removeChild(start.nextSibling);
    var tpl = document.createElement('template'); tpl.innerHTML = html;
    start.parentNode.insertBefore(tpl.content, end);
    return true;
  }
  var liveVersion = null;
  async function loadLive() {
    try {
      var out = await api('/api/live' + (liveVersion ? '?v=' + encodeURIComponent(liveVersion) : ''));
      if (out.unchanged) return;
      liveVersion = out.version;
      Object.keys(out.blocks || {}).forEach(function (k) { applyBlock(k, out.blocks[k]); });
      if (typeof window.__setWeekHistory === 'function') window.__setWeekHistory(out.history || []);
      if (out.meta && out.meta.syncedAt) document.documentElement.setAttribute('data-synced-at', out.meta.syncedAt);
    } catch (e) { /* tenta de novo no próximo ciclo */ }
  }
  window.__cockpitLoadLive = loadLive;
  window.addEventListener('DOMContentLoaded', function () {
    loadLive();
    setInterval(function () { if (!document.hidden) loadLive(); }, LIVE_MS);
  });
})();
