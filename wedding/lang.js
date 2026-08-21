/* wedding/lang.js — language routing for /wedding and /wedding/mx
 *
 * Loaded by all eight pages from <head>. It works out what to do from the page
 * itself, so there is nothing to configure per page:
 *
 *   - any page   : remembers an explicit EN/ES flag click
 *   - EN index   : on a first visit, forwards Spanish-preferring browsers to /mx/
 *
 * Deliberately NOT geo/IP based: an IP says where someone is standing, not what
 * they read. A Monterrey guest in a US airport should still get Spanish.
 */
(function () {
  var KEY = 'wed-lang';
  var root = document.documentElement;
  var isSpanishPage = /^es/i.test(root.lang || '');
  var file = location.pathname.split('/').pop();
  var isIndex = (file === '' || file === 'index.html');

  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function remember(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  /* 1 — record an explicit choice, on every page.
     Capture phase, so it lands before the browser starts unloading. */
  document.addEventListener('click', function (e) {
    for (var t = e.target; t && t.nodeType === 1; t = t.parentNode) {
      if (t.classList && t.classList.contains('lang')) {
        remember(/es/i.test(t.getAttribute('hreflang') || '') ? 'es' : 'en');
        return;
      }
    }
  }, true);

  /* 2 — first-visit routing. English landing page only: child pages and the
     Spanish site never redirect, so shared links always open as sent. */
  if (isSpanishPage || !isIndex) return;
  if (stored()) return;

  /* Arriving from the Spanish site means they clicked EN on purpose. This also
     keeps private-mode visitors (where the storage write throws) out of a loop. */
  try {
    if (document.referrer && document.referrer.indexOf('/mx/') > -1) return;
  } catch (e) {}

  var pref = (navigator.languages && navigator.languages[0]) || navigator.language || '';
  if (/^es(-|$)/i.test(pref)) location.replace('./mx/index.html');
})();
