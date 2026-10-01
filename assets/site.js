// Your Cover's Blown site behaviour — vanilla JS, no dependencies.
// Bound once via WeakSet guards so the DCMSX preview can re-run this script
// after a soft refresh without double-binding survivors.
// boot runs again over a page put in this one's place (Listen now, below).
(function boot() {
  var bound = window.__ycbBound || (window.__ycbBound = new WeakSet());
  function once(el, fn) { if (!el || bound.has(el)) return; bound.add(el); fn(el); }

  // ---------- lightbox: one shared <dialog>, delegated ----------
  var lb = document.querySelector('.ycb-lightbox');
  if (!lb) {
    lb = document.createElement('dialog');
    lb.className = 'ycb-lightbox';
    lb.innerHTML = '<button class="lightbox-close" aria-label="Close">×</button><img alt="">';
    document.body.appendChild(lb);
    lb.querySelector('.lightbox-close').addEventListener('click', function () { lb.close(); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lb.close(); });
  }
  once(document.body, function (body) {
    body.addEventListener('click', function (e) {
      var img = e.target.closest('[data-lightbox]');
      if (!img) return;
      lb.querySelector('img').src = img.currentSrc || img.src;
      lb.querySelector('img').alt = img.alt || '';
      lb.showModal();
    });
  });

  // ---------- the audio player ----------
  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' : '') + mm + ':' + String(sec).padStart(2, '0');
  }
  // "1:02:30" -> seconds (the duration from front matter, until metadata loads)
  function secs(t) {
    var p = String(t || '').trim().split(':').map(Number);
    if (!p.length || p.some(isNaN)) return 0;
    return p.reduce(function (a, n) { return a * 60 + n; }, 0);
  }
  // Where each episode was left, kept in the browser under the file it plays:
  // the episode's page opens at it, a visit another day carries on from
  // there, and its row in a list reads Resume. A page left while it plays
  // says so (GOING, good for a few seconds) and the same episode's player on
  // the page arrived at carries straight on where the browser lets a page
  // start sound by itself; where it does not, the player waits at the place.
  // No storage (private windows) = every episode from its start.
  var POS = 'ycb-pos:', GOING = 'ycb-going';
  function kept(src) { try { return Number(localStorage.getItem(POS + src)) || 0; } catch (e) { return 0; } }
  function keep(src, t) {
    try { if (t > 0) localStorage.setItem(POS + src, t.toFixed(1)); else localStorage.removeItem(POS + src); } catch (e) {}
  }
  function going() {
    try {
      var g = JSON.parse(sessionStorage.getItem(GOING) || 'null');
      return g && Date.now() - g.at < 15000 ? g.src : null;
    } catch (e) { return null; }
  }
  function notGoing() { try { sessionStorage.removeItem(GOING); } catch (e) {} }
  var wasGoing = going();
  notGoing();
  var players = document.querySelectorAll('[data-player]');
  players.forEach(function (box) {
    once(box, function () {
      var audio = box.querySelector('audio');
      var play = box.querySelector('[data-play]');
      var seek = box.querySelector('[data-seek]');
      var cur = box.querySelector('[data-cur]');
      var durEl = box.querySelector('[data-dur]');
      if (!audio || !play) return;
      var known = durEl ? secs(durEl.textContent) : 0;
      var scrubbing = false;   // finger/mouse/keys on the bar: it leads, the audio follows
      var src = audio.getAttribute('src') || '';
      // a place the audio has been sent to before it has loaded anything: it
      // has no time of its own until then, so this stands for it — on the bar
      // and in the sums — and is given to it again once it can take it
      var from = null;
      var saved = 0;
      function at() { return from != null ? from : audio.currentTime; }
      function go(t) {
        from = audio.readyState < 1 ? t : null;
        try { audio.currentTime = t; } catch (e) {}
      }
      // a button labelled 'Play <something>' keeps the name when the state flips
      var what = (play.getAttribute('aria-label') || '').replace(/^(Play|Pause)\s*/, '');
      function label(state) { play.setAttribute('aria-label', what ? state + ' ' + what : state); }

      function duration() { return isFinite(audio.duration) && audio.duration > 0 ? audio.duration : known; }
      // the bar is usable as soon as we know how long the episode is — from
      // front matter before metadata, from the file after
      function arm() {
        var d = duration();
        if (!seek || !d) return;
        seek.max = d;
        seek.disabled = false;
      }
      function draw() {
        var d = duration();
        var t = scrubbing && seek ? Number(seek.value) : at();
        if (seek && !scrubbing) seek.value = t;
        if (cur) cur.textContent = fmt(t);
        if (durEl && d) durEl.textContent = fmt(d);
        var pos = d ? Math.min(100, t / d * 100) : 0;
        var buf = 0, r = audio.buffered;
        for (var i = 0; i < r.length; i++) if (r.start(i) <= t + 1 && r.end(i) > buf) buf = r.end(i);
        box.style.setProperty('--pos', pos.toFixed(2) + '%');
        box.style.setProperty('--buf', (d ? Math.min(100, Math.max(pos, buf / d * 100)) : 0).toFixed(2) + '%');
      }
      // the place is kept every few seconds as it plays and at once when it
      // is paused, moved or the page goes; the first seconds and the last are
      // no place to come back to, so there the episode is simply unheard
      function save(now) {
        if (from != null) return;
        var t = audio.currentTime, d = duration();
        if (!now && Math.abs(t - saved) < 5) return;
        saved = t;
        keep(src, t < 5 || (d && t > d - 15) ? 0 : t);
      }
      arm();
      audio.addEventListener('loadedmetadata', function () {
        if (from != null) { try { audio.currentTime = from; } catch (e) {} }
        arm(); draw();
      });
      // Safari can let a time set at loadedmetadata go; by now it holds
      audio.addEventListener('canplay', function () {
        if (from == null) return;
        if (Math.abs(audio.currentTime - from) > 1) { try { audio.currentTime = from; } catch (e) {} }
        from = null;
        draw();
      });
      audio.addEventListener('durationchange', function () { arm(); draw(); });
      audio.addEventListener('progress', draw);
      audio.addEventListener('timeupdate', function () { draw(); save(); });
      audio.addEventListener('seeked', function () { draw(); save(true); });
      function playing() {
        box.classList.add('is-playing');
        box.classList.add('is-started');
        label('Pause');
        // one voice at a time
        players.forEach(function (other) {
          var a = other !== box && other.querySelector('audio');
          if (a && !a.paused) a.pause();
        });
      }
      audio.addEventListener('play', playing);
      if (!audio.paused) playing();   // handed over already running (Listen now)
      audio.addEventListener('pause', function () {
        box.classList.remove('is-playing');
        label('Play');
        save(true);
      });
      audio.addEventListener('ended', function () { audio.currentTime = 0; keep(src, 0); draw(); });
      window.addEventListener('pagehide', function () {
        save(true);
        if (audio.paused) return;
        try { sessionStorage.setItem(GOING, JSON.stringify({ src: src, at: Date.now() })); } catch (e) {}
      });
      play.addEventListener('click', function () {
        if (audio.paused) audio.play().catch(function () {}); else audio.pause();
      });
      if (seek) {
        // input fires continuously while dragging (and per keypress); change
        // fires on release. Seek on both — the server answers Range requests
        // — and keep the thumb under the pointer instead of snapping back to
        // wherever timeupdate says the audio still is.
        seek.addEventListener('pointerdown', function () { scrubbing = true; });
        seek.addEventListener('input', function () {
          scrubbing = true;
          go(Number(seek.value));
          draw();
        });
        seek.addEventListener('change', function () {
          go(Number(seek.value));
          scrubbing = false;
          draw();
        });
        ['pointerup', 'pointercancel'].forEach(function (ev) {
          window.addEventListener(ev, function () { if (scrubbing) { scrubbing = false; draw(); } });
        });
      }
      box.querySelectorAll('[data-skip]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var d = duration();
          var t = Math.max(0, at() + Number(btn.dataset.skip));
          go(d ? Math.min(d, t) : t);
          draw();
        });
      });
      // the chapter list under the player: a row takes the player there and
      // starts it; the row playing is marked as the time passes
      var chapters = Array.prototype.slice.call(box.parentNode ? box.parentNode.querySelectorAll('[data-chapter]') : []);
      chapters.forEach(function (btn) {
        btn.addEventListener('click', function () {
          go(Number(btn.dataset.chapter) || 0);
          draw();
          audio.play().catch(function () {});
        });
      });
      function mark() {
        var now = at(), on = null;
        chapters.forEach(function (btn) { if (Number(btn.dataset.chapter) <= now + 0.5) on = btn; });
        chapters.forEach(function (btn) { btn.parentNode.classList.toggle('is-current', btn === on); });
      }
      if (chapters.length) audio.addEventListener('timeupdate', mark);
      // take the kept place — as the page loads, and again when the page is
      // brought back as it was left (Back), since the episode may have moved
      // on in another page since. carry = the episode that was playing on the
      // page come from: this player carries on with it.
      function pick(carry) {
        var t = kept(src), d = duration();
        if (t >= 5 && !(d && t > d - 15) && Math.abs(t - at()) > 1) {
          go(t);
          saved = t;
          box.classList.add('is-started');
          if (chapters.length) mark();
        }
        if (carry && carry === src && audio.paused) audio.play().catch(function () {});
        draw();
      }
      pick(wasGoing);
      window.addEventListener('pageshow', function (e) {
        // reached by Back without being kept whole, the browser puts the
        // bar's old value back into it after this script has run
        if (!e.persisted) { draw(); return; }
        var g = going();
        if (g === src) notGoing();
        pick(g);
      });
    });
  });

  // ---------- Listen now: the episode's page, already playing ----------
  // A row's Listen now is a link to the episode's own page, and one press is
  // to be all of it: the page, with the episode playing. A browser lets sound
  // start only from a press, and Safari keeps that to the page the press was
  // on — a page it then loads cannot start anything. So the press starts the
  // sound here, the episode's page is fetched and put in this one's place
  // (header, main and footer, title, address), and the sound, already
  // running, is handed to that page's player. The address is a pushed one:
  // Back, or any address that is not the page drawn, is loaded for real.
  // If the page does not come, or the browser cannot do this, the link is
  // followed as a link and the player there is asked to start (GOING) —
  // which Chrome allows and Safari does not. A press with a key held, or
  // any other button, is the browser's own: a new tab gets the page, waiting.
  var drawn = window.__ycbDrawn || (window.__ycbDrawn = { path: location.pathname });
  var LEFT = 'ycb-left';
  once(document.documentElement, function () {
    window.addEventListener('popstate', function () {
      if (location.pathname !== drawn.path) location.reload();
    });
    // that reload is of the list the press was on: it comes back where it
    // was left — the row pressed as far down the window as it was ({ path,
    // href, top }, written as the list's place is taken; y for a list that
    // no longer has the row). By the row and not by the scroll, since the
    // pictures above it size late and a scroll set before they do ends up
    // somewhere else. The browser's own restore would put it where the page
    // in its place had been — the top — so for this one load it is told to
    // leave the scroll alone.
    try {
      var left = JSON.parse(sessionStorage.getItem(LEFT) || 'null');
      if (left && left.path === location.pathname) {
        sessionStorage.removeItem(LEFT);
        var nav = performance.getEntriesByType ? performance.getEntriesByType('navigation')[0] : null;
        if (nav && nav.type !== 'navigate') {
          var to = function () {
            var row = null;
            document.querySelectorAll('a[data-listen]').forEach(function (l) { if (!row && l.getAttribute('href') === left.href) row = l; });
            window.scrollTo({ top: row ? window.scrollY + row.getBoundingClientRect().top - left.top : left.y, left: 0, behavior: 'instant' });
          };
          history.scrollRestoration = 'manual';
          window.addEventListener('pagehide', function () { history.scrollRestoration = 'auto'; });
          to();
          window.addEventListener('load', to);   // again once the pictures have sized
        }
      }
    } catch (e) {}
  });
  function follow(href, src) {
    try { sessionStorage.setItem(GOING, JSON.stringify({ src: src, at: Date.now() })); } catch (e) {}
    location.href = href;
  }
  // doc is the fetched page; answers false, with nothing touched, if it is
  // not a page with this sound's player on it
  function arrive(doc, href, audio, link) {
    var src = audio.getAttribute('src'), spot = null;
    doc.querySelectorAll('[data-player] > audio').forEach(function (a) {
      if (!spot && a.getAttribute('src') === src) spot = a;
    });
    var main = doc.querySelector('main'), here = document.querySelector('main');
    if (!spot || !main || !here) return false;
    // the page's own audio never enters this document, so it fetches nothing;
    // a mark holds its place for the one that is running. Parsed without
    // scripts, <noscript> came out as real elements — the twin player goes.
    var mark = doc.createComment('');
    spot.replaceWith(mark);
    main.querySelectorAll('noscript').forEach(function (n) { n.remove(); });
    var was = location.href;
    try {
      sessionStorage.setItem(LEFT, JSON.stringify({ path: location.pathname, y: window.scrollY, href: link.getAttribute('href'), top: link.getBoundingClientRect().top }));
    } catch (e) {}
    history.pushState(null, '', href);
    drawn.path = location.pathname;
    document.title = doc.title;
    ['meta[name="description"]', 'link[rel="canonical"]'].forEach(function (sel) {
      var o = document.head.querySelector(sel), n = doc.head.querySelector(sel);
      if (!o || !n) return;
      ['content', 'href'].forEach(function (k) { if (n.hasAttribute(k)) o.setAttribute(k, n.getAttribute(k)); });
    });
    document.body.className = doc.body.className;
    // the header: its links change with the page; the mark is left running
    // where it is the same mark, so it does not blink
    var oh = document.querySelector('.ycb-header'), nh = doc.querySelector('.ycb-header');
    var logo = function (h) { var i = h.querySelector('[data-vhs] img'); return i ? i.getAttribute('src') : null; };
    if (oh && nh && oh.children.length === nh.children.length && logo(oh) && logo(oh) === logo(nh)) {
      var fresh = Array.prototype.slice.call(nh.children);
      Array.prototype.slice.call(oh.children).forEach(function (el, i) {
        if (!el.querySelector('[data-vhs]')) el.replaceWith(document.adoptNode(fresh[i]));
      });
    } else if (nh) {
      nh = document.adoptNode(nh);
      if (oh) oh.replaceWith(nh); else here.parentNode.insertBefore(nh, here);
    } else if (oh) oh.remove();
    var of = document.querySelector('.ycb-footer'), nf = doc.querySelector('.ycb-footer');
    if (nf) {
      nf = document.adoptNode(nf);
      if (of) of.replaceWith(nf); else here.parentNode.insertBefore(nf, here.nextSibling);
    } else if (of) of.remove();
    main = document.adoptNode(main);
    here.replaceWith(main);
    mark.replaceWith(audio);
    try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, 0); }
    boot();
    // the keys are on the player: space pauses what the press started
    var key = audio.parentNode.querySelector('[data-play]');
    if (key) { try { key.focus({ preventScroll: true }); } catch (e) {} }
    // a page view, as the loaded page would have counted itself
    if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: location.pathname, title: document.title, referrer: was });
    return true;
  }
  document.querySelectorAll('a[data-listen]').forEach(function (link) {
    once(link, function () {
      var src = link.getAttribute('data-listen');
      var word = link.querySelector('.ep-listen-play');
      var wordFresh = word ? word.textContent : '';
      function draw() {
        link.classList.remove('is-going');
        if (word) word.textContent = kept(src) >= 5 ? 'Resume' : wordFresh;
      }
      draw();
      // brought back as it was left (Back): the place may have moved on
      window.addEventListener('pageshow', function (e) { if (e.persisted) draw(); });
      link.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        if (link.classList.contains('is-going')) return;
        link.classList.add('is-going');
        var href = link.href;
        if (!window.fetch || !window.DOMParser || !history.pushState) return follow(href, src);
        var audio = new Audio(), t = kept(src);
        audio.preload = 'auto';
        audio.src = src;
        // from its place: asked for now, and again once the file can take it,
        // which is before any of it sounds
        if (t >= 5) {
          try { audio.currentTime = t; } catch (err) {}
          audio.addEventListener('loadedmetadata', function () {
            if (Math.abs(audio.currentTime - t) > 1) { try { audio.currentTime = t; } catch (err) {} }
          }, { once: true });
        }
        audio.play().catch(function () {});
        fetch(href)
          .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
          .then(function (html) {
            if (!arrive(new DOMParser().parseFromString(html, 'text/html'), href, audio, link)) throw new Error('not the episode');
          })
          .catch(function () { audio.pause(); follow(href, src); });
      });
    });
  });

  // ---------- newsletter signup (first-party capture worker) ----------
  // Submits in the background and swaps the form for an inline thanks. The
  // Turnstile spam-check script only loads once someone focuses the email box,
  // so pages stay light. With JS off the form still POSTs natively and the
  // worker bounces back to /?subscribed=…, which the load-time check renders.
  // Turnstile calls this (data-before-interactive-callback) when it needs to
  // show a visible challenge — until then CSS keeps its box collapsed.
  window.dcmsxTurnstileInteractive = function () {
    document.querySelectorAll('.cf-turnstile').forEach(function (el) { el.classList.add('cf-turnstile-show'); });
  };
  document.querySelectorAll('form[data-newsletter]').forEach(function (form) {
    once(form, function () {
      var msg = form.querySelector('.nl-msg');
      function show(text, isError) {
        if (!msg) return;
        msg.hidden = false;
        msg.textContent = text;
        msg.classList.toggle('nl-msg-error', !!isError);
      }
      function done() {
        form.querySelectorAll('.sign-up-box, .mc-button, .cf-turnstile').forEach(function (el) {
          el.style.display = 'none';
        });
        show('Thank you – your details have been received');
      }
      if (/[?&]subscribed=1\b/.test(location.search)) return done();
      if (/[?&]subscribed=error\b/.test(location.search)) {
        show('Something went wrong — please try signing up again.', true);
      }
      function loadTurnstile() {
        var box = form.querySelector('.cf-turnstile');
        if (!box) return;
        if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
          // the script draws the boxes it finds as it loads; a form that came
          // after it (a page put in this one's place) is drawn by asking
          if (window.turnstile && window.turnstile.render && !box.firstChild) {
            try {
              window.turnstile.render(box, { sitekey: box.dataset.sitekey, appearance: box.dataset.appearance, size: box.dataset.size,
                'before-interactive-callback': window.dcmsxTurnstileInteractive });
            } catch (e) {}
          }
          return;
        }
        var s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
        s.async = true;
        document.head.appendChild(s);
      }
      var email = form.querySelector('input[type="email"]');
      if (email) email.addEventListener('focus', loadTurnstile, { once: true });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        loadTurnstile();
        var needsToken = !!form.querySelector('.cf-turnstile');
        var tries = 0;
        (function attempt() {
          // the invisible check may still be running — wait for its token
          var token = form.querySelector('[name="cf-turnstile-response"]');
          if (needsToken && !(token && token.value)) {
            if (++tries > 40) return show('Couldn’t run the spam check — please reload and try again.', true);
            show('Checking…');
            return setTimeout(attempt, 250);
          }
          var button = form.querySelector('.mc-button');
          if (button) button.disabled = true;
          var data = new URLSearchParams(new FormData(form));
          data.set('source', location.origin + location.pathname);
          data.set('js', '1');
          fetch(form.action, { method: 'POST', body: data })
            .then(function (r) { return r.json(); })
            .then(function (j) {
              if (j.ok) return done();
              show(j.error || 'Something went wrong — please try again.', true);
              if (button) button.disabled = false;
            })
            .catch(function () { form.submit(); }); // fetch blocked → native POST
        })();
      });
    });
  });

  // ---------- the readers figure: blink and sway ----------
  // The same sums as the clip maker's corner figure (CLIPS_READERS_MOTION in
  // admin/server.js): each reader blinks on two clocks of their own, so the
  // pair never falls into a rhythm; the figure sways from the hips by a
  // fraction of its own width. Reduce-motion leaves the still figure.
  var RD = { blinkL: [[1.3, 4.1], [2.9, 6.7]], blinkR: [[0.4, 5.3], [3.1, 7.9]], blink: 0.14,
    tilt: 0.007, tiltPeriod: 11, dx: 0.35, dxPeriod: 9, dxPhase: 1, dy: 0.35, dyPeriod: 7 };
  var rdStill = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function rdMod(a, b) { return ((a % b) + b) % b; }
  function rdShut(clocks, t) {
    for (var i = 0; i < clocks.length; i++) if (rdMod(t + clocks[i][0], clocks[i][1]) < RD.blink) return true;
    return false;
  }
  document.querySelectorAll('.block-readers .readers.is-live').forEach(function (fig) {
    once(fig, function () {
      if (rdStill) return;
      var t0 = performance.now(), l = false, r = false;
      function frame(now) {
        if (!fig.isConnected) return;   // the preview replaced the page under us
        var t = (now - t0) / 1000;
        var nl = rdShut(RD.blinkL, t), nr = rdShut(RD.blinkR, t);
        if (nl !== l) { l = nl; fig.classList.toggle('l-shut', l); }
        if (nr !== r) { r = nr; fig.classList.toggle('r-shut', r); }
        fig.style.transform = 'translate(' + (RD.dx * Math.sin(2 * Math.PI * t / RD.dxPeriod + RD.dxPhase)).toFixed(3) + '%,'
          + (RD.dy * Math.sin(2 * Math.PI * t / RD.dyPeriod)).toFixed(3) + '%) rotate('
          + (RD.tilt * Math.sin(2 * Math.PI * t / RD.tiltPeriod)).toFixed(5) + 'rad)';
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  });

  // ---------- the wordmark: tape grain and flicker ----------
  // The look the videos give it (drawLogo in admin/visualiser/index.html):
  // fresh grain over the letters every frame — a multiply pass and a screen
  // pass, then the mark's own shape put back so the noise never spills onto
  // the black round it — and a faint flicker in the whole mark's brightness.
  // The picture stays in the page, holding the box; the canvas is laid over
  // it and only runs while the mark is on screen. Reduce-motion, or a picture
  // that never loads, leaves the still mark.
  var VHS = { grain: 0.12, flicker: 0.06, fps: 30, tile: 256 };
  var vhsTiles = [];
  function vhsTile() {
    if (!vhsTiles.length) for (var i = 0; i < 3; i++) {
      var c = document.createElement('canvas'); c.width = c.height = VHS.tile;
      var g = c.getContext('2d'), d = g.createImageData(VHS.tile, VHS.tile);
      for (var p = 0; p < d.data.length; p += 4) { d.data[p] = d.data[p + 1] = d.data[p + 2] = Math.random() * 255; d.data[p + 3] = 255; }
      g.putImageData(d, 0, 0); vhsTiles.push(c);
    }
    return vhsTiles[Math.floor(Math.random() * vhsTiles.length)];
  }
  document.querySelectorAll('.ycb-vhs[data-vhs]').forEach(function (box) {
    once(box, function () {
      var img = box.querySelector('img');
      if (rdStill || !img) return;
      var cv = document.createElement('canvas'), g = cv.getContext('2d');
      cv.setAttribute('aria-hidden', 'true');
      var seen = true, last = 0;
      if (window.IntersectionObserver) {
        new IntersectionObserver(function (es) { seen = es[es.length - 1].isIntersecting; }).observe(box);
      }
      function frame(now) {
        if (!box.isConnected) return;   // the preview replaced the page under us
        requestAnimationFrame(frame);
        if (!seen || now - last < 1000 / VHS.fps - 2) return;
        last = now;
        // grain is a CSS pixel across whatever the screen's density, so it
        // reads the same on a phone as on a desk
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var w = Math.round(box.clientWidth * dpr), h = Math.round(box.clientHeight * dpr);
        if (!w || !h) return;
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        g.clearRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
        ['multiply', 'screen'].forEach(function (mode) {
          g.save();
          g.globalCompositeOperation = mode; g.globalAlpha = VHS.grain; g.imageSmoothingEnabled = false;
          g.scale(dpr, dpr);
          g.translate(-Math.floor(Math.random() * VHS.tile), -Math.floor(Math.random() * VHS.tile));
          g.fillStyle = g.createPattern(vhsTile(), 'repeat');
          g.fillRect(0, 0, w / dpr + VHS.tile, h / dpr + VHS.tile);
          g.restore();
        });
        g.globalCompositeOperation = 'destination-in'; g.globalAlpha = 1;
        g.drawImage(img, 0, 0, w, h);
        cv.style.opacity = Math.min(1, 1 + (Math.random() - 0.5) * VHS.flicker).toFixed(3);
      }
      function start() {
        if (!img.naturalWidth) return;
        box.appendChild(cv); box.classList.add('is-live');
        requestAnimationFrame(frame);
      }
      if (img.complete) start(); else img.addEventListener('load', start);
    });
  });

  // ---------- the episode's book: its cover on a block, turning ----------
  // The book the videos carry (the 3D book in admin/clips/index.html — the
  // same box, light and sums, and the turn the episodes' own videos use,
  // taken far slower — 26 s there and back against their 9 — so that a list
  // of them stirs rather than spins): a
  // box the cover's shape wearing the cover, its spine and back the cover's
  // own edges stretched (bkEdge), the page block cream with a closed book's fine
  // lines, lit from the upper left with a sheen that crosses the cover as it
  // turns. Each book keeps a clock of its own — where in the turn it starts,
  // how long a turn takes, the angle it rests at — picked as the page loads,
  // so a list of them never moves as one. One WebGL context draws them all,
  // each then copied to its own canvas over the picture (a context per book
  // would run out on a long list). They are drawn only while on screen.
  // Reduce-motion gets the book standing still; no WebGL, the flat cover.
  var BOOK = { cam: 2.4, light: [-0.45, 0.55, 1], amb: 0.42, spec: 48, sheen: 0.5, bulge: 0.05, spineBulge: 0.6, strip: 0.035, ink: 40, nod: 0.12,
    pages: ['#f2ecdd', '#d8d0bc'], thick: 0.12, angle: 25, swing: 0, back: 45, lean: 6, pace: 26, gloss: 0.3, fps: 30,
    vary: { pace: 0.15, angle: 5 } };
  var BOOK_VS = 'attribute vec3 aPos; attribute vec2 aUV; uniform mat3 uR; uniform float uF, uCam, uCx, uCy, uW, uH;'
    + 'varying vec2 vUV; varying vec3 vPos;'
    + 'void main() { vec3 v = uR * aPos; float w = uCam - v.z; float px = uCx + uF * v.x / w; float py = uCy - uF * v.y / w;'
    + ' float nx = (px - uW * 0.5) / (uW * 0.5); float ny = (uH * 0.5 - py) / (uH * 0.5); float nz = (w - uCam) / 3.0;'
    + ' gl_Position = vec4(nx * w, ny * w, nz * w, w); vUV = aUV; vPos = v; }';
  // flat-lit, the cover square on coming out at the picture's own colours
  // (uNorm), the bulge tilting the normal across the face, a sheen for the
  // covers and none for the pages
  var BOOK_FS = 'precision highp float; varying vec2 vUV; varying vec3 vPos; uniform sampler2D uTex;'
    + 'uniform vec3 uN, uT, uB, uL; uniform float uCam, uBulge, uGloss, uNorm, uAmb, uMatte;'
    + 'void main() { vec4 c = texture2D(uTex, vUV);'
    + ' vec3 n = normalize(uN + uT * uBulge * (vUV.x - 0.5) * 2.0 + uB * uBulge * (vUV.y - 0.5));'
    + ' float dif = max(dot(n, uL), 0.0); float light = (uAmb + (1.0 - uAmb) * dif) / uNorm;'
    + ' vec3 V = normalize(vec3(0.0, 0.0, uCam) - vPos); vec3 h = normalize(uL + V);'
    + ' float spec = (1.0 - uMatte) * pow(max(dot(n, h), 0.0), ' + BOOK.spec + '.0) * uGloss * ' + BOOK.sheen + ';'
    + ' gl_FragColor = vec4(min(c.rgb * light + spec, 1.0), 1.0); }';
  // one drawing context and one list of books for the page, kept on window
  // so a preview re-running this script adds to them rather than starting over
  var bk = window.__ycbBook || (window.__ycbBook = { gl: null, cv: null, loc: null, light: null, pages: null, failed: false, list: [], running: false, last: 0 });
  function bkInit() {
    if (bk.gl || bk.failed) return bk.gl;
    try {
      var cv = document.createElement('canvas');
      var gl = cv.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true, depth: true });
      if (!gl) throw new Error('no WebGL');
      var sh = function (type, src) {
        var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
        return o;
      };
      var prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, BOOK_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, BOOK_FS)); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      var loc = { aPos: gl.getAttribLocation(prog, 'aPos'), aUV: gl.getAttribLocation(prog, 'aUV') };
      ['uR', 'uF', 'uCam', 'uCx', 'uCy', 'uW', 'uH', 'uTex', 'uN', 'uT', 'uB', 'uL', 'uBulge', 'uGloss', 'uNorm', 'uAmb', 'uMatte'].forEach(function (u) { loc[u] = gl.getUniformLocation(prog, u); });
      gl.enableVertexAttribArray(loc.aPos); gl.enableVertexAttribArray(loc.aUV);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0);
      var L = BOOK.light, len = Math.sqrt(L[0] * L[0] + L[1] * L[1] + L[2] * L[2]);
      bk.cv = cv; bk.loc = loc; bk.light = [L[0] / len, L[1] / len, L[2] / len];
      bk.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      // a lost context (the tab starved of graphics memory) leaves the flat covers
      cv.addEventListener('webglcontextlost', function () {
        bk.failed = true; bk.gl = null;
        bk.list.forEach(function (b) { b.box.classList.remove('is-live'); });
        bk.list = [];
      });
      // the page block: cream, with the fine lines of a closed book
      var pg = document.createElement('canvas'); pg.width = 256; pg.height = 64;
      var pc = pg.getContext('2d');
      pc.fillStyle = BOOK.pages[0]; pc.fillRect(0, 0, 256, 64); pc.fillStyle = BOOK.pages[1];
      for (var x = 0; x < 256; x += 3) {
        var r = Math.sin(x * 127.1 + 311.7) * 43758.5453;
        pc.globalAlpha = 0.35 + 0.65 * (r - Math.floor(r)); pc.fillRect(x, 0, 1, 64);
      }
      bk.gl = gl;
      bk.pages = bkTexture(pg);
      return gl;
    } catch (e) { bk.failed = true; bk.gl = null; return null; }
  }
  // textures are drawn onto power-of-two canvases first, so they can carry
  // mipmaps — small type on a turned cover shimmers without them
  function bkTexture(src) {
    var gl = bk.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    if (bk.aniso) gl.texParameterf(gl.TEXTURE_2D, bk.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(bk.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return t;
  }
  function bkPiece(img, sx, sw, w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, sx, 0, sw, img.naturalHeight, 0, 0, w, h);
    return c;
  }
  // the spine and the back wear the cover's own edge stretched — and a title
  // set hard against the side (the D of DIFFERENCE) is inside that edge, so
  // the stretch drew it down the spine as a black mark. A row of the strip
  // that the cover's print cuts into is given its ground instead, all the way
  // across: the colour of its outer end (the middle one of the outer third,
  // which a stray line down the picture's very edge does not move). A row
  // that is all ground is left as it was.
  function bkEdge(img, right) {
    var w = img.naturalWidth, sw = Math.max(2, Math.round(w * BOOK.strip)), W = 32, H = 512, n = 10;
    var c = bkPiece(img, right ? w - sw : 0, sw, W, H);
    try {
      var g = c.getContext('2d'), im = g.getImageData(0, 0, W, H), d = im.data, ch = [[], [], []];
      for (var y = 0; y < H; y++) {
        var o = y * W * 4, x, k, cut = false, ref = [];
        for (k = 0; k < 3; k++) {
          for (x = 0; x < n; x++) ch[k][x] = d[o + (right ? W - 1 - x : x) * 4 + k];
          ref[k] = ch[k].sort(function (p, q) { return p - q; })[n >> 1];
        }
        for (x = 0; x < W && !cut; x++) for (k = 0; k < 3; k++) if (Math.abs(d[o + x * 4 + k] - ref[k]) > BOOK.ink) cut = true;
        if (cut) for (x = 0; x < W; x++) for (k = 0; k < 3; k++) d[o + x * 4 + k] = ref[k];
      }
      g.putImageData(im, 0, 0);
    } catch (e) { /* a picture from elsewhere cannot be read: the edge as it is */ }
    return c;
  }
  // yaw about y, then pitch about x (row-major); positive yaw brings the spine
  // round towards the eye, positive pitch tips the top towards it
  function bkRot(yaw, pitch) {
    var a = yaw * Math.PI / 180, p = pitch * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), cp = Math.cos(p), sp = Math.sin(p);
    return [ca, 0, sa, sp * sa, cp, -sp * ca, -cp * sa, sp, cp * ca];
  }
  function bkMul(R, v) { return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]]; }
  // the turn and the tilt at phase ph of a turn there and back: one sine,
  // `swing` spine-round from the resting angle and `back` the other way,
  // with a dip twice a turn. Phase 0 is the book at rest.
  function bkPose(b, ph) {
    var A = (BOOK.swing + BOOK.back) / 2, c = b.angle + (BOOK.swing - BOOK.back) / 2;
    var ph0 = A > 0 ? Math.asin(Math.max(-1, Math.min(1, (b.angle - c) / A))) : 0;
    return { yaw: c + A * Math.sin(ph + ph0), pitch: BOOK.lean + BOOK.nod * A * Math.sin(2 * ph) };
  }
  // a book made for a picture that has loaded: its textures, its six faces
  // (four corners each as the texture reads them, the face's normal, the way
  // across and down its texture — the page faces read theirs along z, so the
  // lines run the way pages stack) and the box round every pose of its turn,
  // so the canvas holds the whole of it wherever it has got to
  function bkMake(box, img) {
    var gl = bkInit();
    if (!gl) return null;
    var w = img.naturalWidth, h = img.naturalHeight;
    var hh = h / w, X = 0.5, Y = hh / 2, Z = BOOK.thick / 2;
    var faces = [
      { k: 'cover', p: [[-X, Y, Z], [X, Y, Z], [X, -Y, Z], [-X, -Y, Z]], n: [0, 0, 1], t: [1, 0, 0], b: [0, -1, 0], bulge: BOOK.bulge, matte: 0 },
      { k: 'back', p: [[X, Y, -Z], [-X, Y, -Z], [-X, -Y, -Z], [X, -Y, -Z]], n: [0, 0, -1], t: [-1, 0, 0], b: [0, -1, 0], bulge: BOOK.bulge, matte: 0 },
      { k: 'spine', p: [[-X, Y, -Z], [-X, Y, Z], [-X, -Y, Z], [-X, -Y, -Z]], n: [-1, 0, 0], t: [0, 0, 1], b: [0, -1, 0], bulge: BOOK.spineBulge, matte: 0 },
      { k: 'pages', p: [[X, Y, -Z], [X, Y, Z], [X, -Y, Z], [X, -Y, -Z]], n: [1, 0, 0], t: [0, 0, 1], b: [0, -1, 0], bulge: 0, matte: 1 },
      { k: 'pages', p: [[-X, Y, -Z], [-X, Y, Z], [X, Y, Z], [X, Y, -Z]], n: [0, 1, 0], t: [0, 0, 1], b: [1, 0, 0], bulge: 0, matte: 1 },
      { k: 'pages', p: [[-X, -Y, -Z], [-X, -Y, Z], [X, -Y, Z], [X, -Y, -Z]], n: [0, -1, 0], t: [0, 0, 1], b: [1, 0, 0], bulge: 0, matte: 1 }
    ];
    var uv = [[0, 0], [1, 0], [1, 1], [0, 1]], data = [];
    faces.forEach(function (f) { [0, 1, 2, 0, 2, 3].forEach(function (i) { data.push(f.p[i][0], f.p[i][1], f.p[i][2], uv[i][0], uv[i][1]); }); });
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    var cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    var b = { box: box, cv: cv, g: cv.getContext('2d'), buf: buf, faces: faces, hh: hh, cam: BOOK.cam * hh, seen: true, w: 0, h: 0,
      // its own clock: where in the turn it starts, how long a turn takes, the angle it rests at
      phase: Math.random(), pace: BOOK.pace * (1 + (Math.random() * 2 - 1) * BOOK.vary.pace), angle: BOOK.angle + (Math.random() * 2 - 1) * BOOK.vary.angle,
      tex: { cover: bkTexture(bkPiece(img, 0, w, 512, 512)), back: bkTexture(bkEdge(img, true)), spine: bkTexture(bkEdge(img, false)), pages: bk.pages } };
    // the box round every pose, at a focal length of one
    var o = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
    for (var k = 0; k < 96; k++) {
      var pose = bkPose(b, 2 * Math.PI * k / 96), R = bkRot(pose.yaw, pose.pitch);
      [-X, X].forEach(function (cx) { [-Y, Y].forEach(function (cy) { [-Z, Z].forEach(function (cz) {
        var v = bkMul(R, [cx, cy, cz]), d = b.cam - v[2], px = v[0] / d, py = -v[1] / d;
        o.x0 = Math.min(o.x0, px); o.x1 = Math.max(o.x1, px); o.y0 = Math.min(o.y0, py); o.y1 = Math.max(o.y1, py);
      }); }); });
    }
    b.fit = o;
    return b;
  }
  function bkDraw(b, ph) {
    var gl = bk.gl, loc = bk.loc, cv = bk.cv;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.round(b.box.clientWidth * dpr), h = Math.round(b.box.clientHeight * dpr);
    if (!w || !h) return;
    if (rdStill && b.w === w && b.h === h) return;   // standing still, and already drawn at this size
    if (b.cv.width !== w || b.cv.height !== h) { b.cv.width = w; b.cv.height = h; }
    b.w = w; b.h = h;
    // the shared canvas only ever grows; each book is drawn into its corner
    if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, w); cv.height = Math.max(cv.height, h); }
    var o = b.fit, f = Math.min((w - 2) / (o.x1 - o.x0), (h - 2) / (o.y1 - o.y0));
    var pose = bkPose(b, ph), R = bkRot(pose.yaw, pose.pitch);
    gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 20, 0); gl.vertexAttribPointer(loc.aUV, 2, gl.FLOAT, false, 20, 12);
    gl.uniformMatrix3fv(loc.uR, false, [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]);
    gl.uniform1f(loc.uF, f); gl.uniform1f(loc.uCam, b.cam);
    gl.uniform1f(loc.uCx, w / 2 - f * (o.x0 + o.x1) / 2); gl.uniform1f(loc.uCy, h / 2 - f * (o.y0 + o.y1) / 2);
    gl.uniform1f(loc.uW, w); gl.uniform1f(loc.uH, h);
    gl.uniform3fv(loc.uL, bk.light); gl.uniform1f(loc.uAmb, BOOK.amb); gl.uniform1f(loc.uNorm, BOOK.amb + (1 - BOOK.amb) * Math.max(0, bk.light[2]));
    gl.uniform1f(loc.uGloss, BOOK.gloss); gl.uniform1i(loc.uTex, 0); gl.activeTexture(gl.TEXTURE0);
    b.faces.forEach(function (face, i) {
      gl.bindTexture(gl.TEXTURE_2D, b.tex[face.k]);
      gl.uniform3fv(loc.uN, bkMul(R, face.n)); gl.uniform3fv(loc.uT, bkMul(R, face.t)); gl.uniform3fv(loc.uB, bkMul(R, face.b));
      gl.uniform1f(loc.uBulge, face.bulge); gl.uniform1f(loc.uMatte, face.matte);
      gl.drawArrays(gl.TRIANGLES, i * 6, 6);
    });
    b.g.clearRect(0, 0, w, h);
    b.g.drawImage(cv, 0, cv.height - h, w, h, 0, 0, w, h);   // GL counts up from the foot of its canvas
  }
  function bkPhase(b, now) { return rdStill ? 0 : 2 * Math.PI * (now / 1000 / b.pace + b.phase); }
  function bkFrame(now) {
    bk.list = bk.list.filter(function (b) { return b.box.isConnected; });   // the preview replaced the page under us
    if (!bk.list.length || !bk.gl) { bk.running = false; return; }
    requestAnimationFrame(bkFrame);
    if (now - bk.last < 1000 / BOOK.fps - 2) return;
    bk.last = now;
    bk.list.forEach(function (b) { if (b.seen) bkDraw(b, bkPhase(b, now)); });
  }
  // an episode card's book, and the one over the title on the episode's page
  document.querySelectorAll('.ep-cover[data-book], .episode-cover[data-book]').forEach(function (box) {
    once(box, function () {
      var img = box.querySelector('img');
      if (!img) return;
      function start() {
        if (!img.naturalWidth || !box.isConnected) return;
        var b = bkMake(box, img);
        if (!b) return;   // no WebGL: the flat cover stays
        if (window.IntersectionObserver) {
          new IntersectionObserver(function (es) { b.seen = es[es.length - 1].isIntersecting; }, { rootMargin: '80px' }).observe(box);
        }
        bkDraw(b, bkPhase(b, performance.now()));
        box.appendChild(b.cv); box.classList.add('is-live');
        bk.list.push(b);
        if (!bk.running) { bk.running = true; requestAnimationFrame(bkFrame); }
      }
      if (img.complete && img.naturalWidth) start(); else img.addEventListener('load', start);
    });
  });

  // ---------- GoatCounter events ----------
  // any element with data-goat-event fires a named event; shows up in the
  // GoatCounter dashboard alongside pageviews
  once(document.head, function () {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-goat-event]');
      if (!el || !window.goatcounter || !window.goatcounter.count) return;
      window.goatcounter.count({ path: el.dataset.goatEvent, title: el.dataset.goatEvent, event: true });
    });
  });
})();
