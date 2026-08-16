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
  var players = document.querySelectorAll('[data-player]');
  players.forEach(function (box) {
    once(box, function () {
      var audio = box.querySelector('audio');
      var play = box.querySelector('[data-play]');
      var seek = box.querySelector('[data-seek]');
      var time = box.querySelector('[data-time]');
      if (!audio || !play) return;
      var knownDur = (time.textContent.split('/')[1] || '').trim();   // from front matter, until metadata loads

      function draw() {
        var dur = isFinite(audio.duration) && audio.duration ? fmt(audio.duration) : knownDur;
        time.textContent = fmt(audio.currentTime) + (dur ? ' / ' + dur : '');
      }
      audio.addEventListener('loadedmetadata', function () {
        seek.max = audio.duration;
        seek.disabled = false;
        draw();
      });
      audio.addEventListener('timeupdate', function () {
        if (!seek.matches(':active')) seek.value = audio.currentTime;
        draw();
      });
      audio.addEventListener('play', function () {
        box.classList.add('is-playing');
        play.setAttribute('aria-label', 'Pause');
        // one voice at a time
        players.forEach(function (other) {
          var a = other !== box && other.querySelector('audio');
          if (a && !a.paused) a.pause();
        });
      });
      audio.addEventListener('pause', function () {
        box.classList.remove('is-playing');
        play.setAttribute('aria-label', 'Play');
      });
      audio.addEventListener('ended', function () { audio.currentTime = 0; });
      play.addEventListener('click', function () {
        if (audio.paused) audio.play().catch(function () {}); else audio.pause();
      });
      seek.addEventListener('input', function () { audio.currentTime = Number(seek.value); draw(); });
      box.querySelectorAll('[data-skip]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          audio.currentTime = Math.max(0, audio.currentTime + Number(btn.dataset.skip));
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
