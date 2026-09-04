// Your Cover's Blown site behaviour — vanilla JS, no dependencies.
// Bound once via WeakSet guards so the DCMSX preview can re-run this script
// after a soft refresh without double-binding survivors.
(function () {
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
      // episode rows label their button 'Play <episode>' — keep the episode
      // name when the state flips
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
        var t = scrubbing && seek ? Number(seek.value) : audio.currentTime;
        if (seek && !scrubbing) seek.value = t;
        if (cur) cur.textContent = fmt(t);
        if (durEl && d) durEl.textContent = fmt(d);
        var pos = d ? Math.min(100, t / d * 100) : 0;
        var buf = 0, r = audio.buffered;
        for (var i = 0; i < r.length; i++) if (r.start(i) <= t + 1 && r.end(i) > buf) buf = r.end(i);
        box.style.setProperty('--pos', pos.toFixed(2) + '%');
        box.style.setProperty('--buf', (d ? Math.min(100, Math.max(pos, buf / d * 100)) : 0).toFixed(2) + '%');
      }
      arm();
      audio.addEventListener('loadedmetadata', function () { arm(); draw(); });
      audio.addEventListener('durationchange', function () { arm(); draw(); });
      audio.addEventListener('progress', draw);
      audio.addEventListener('timeupdate', draw);
      audio.addEventListener('seeked', draw);
      audio.addEventListener('play', function () {
        box.classList.add('is-playing');
        box.classList.add('is-started');
        label('Pause');
        // one voice at a time
        players.forEach(function (other) {
          var a = other !== box && other.querySelector('audio');
          if (a && !a.paused) a.pause();
        });
      });
      audio.addEventListener('pause', function () {
        box.classList.remove('is-playing');
        label('Play');
      });
      audio.addEventListener('ended', function () { audio.currentTime = 0; draw(); });
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
          audio.currentTime = Number(seek.value);
          draw();
        });
        seek.addEventListener('change', function () {
          audio.currentTime = Number(seek.value);
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
          var t = Math.max(0, audio.currentTime + Number(btn.dataset.skip));
          audio.currentTime = d ? Math.min(d, t) : t;
          draw();
        });
      });
      draw();
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
        if (!form.querySelector('.cf-turnstile')) return;
        if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) return;
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
