(function () {
  if (window.__ARCADE_NAV_MOUNTED__) return;
  window.__ARCADE_NAV_MOUNTED__ = true;

  var script = document.currentScript || document.querySelector('script[src*="arcade-nav.js"]');
  var homeHref = (script && script.getAttribute('data-home')) || '../index.html';
  var pos = (script && script.getAttribute('data-pos')) || 'top-left';
  var gameId = (script && script.getAttribute('data-game-id')) || '';

  // Record recently played game
  try {
    var key = 'pixel_arcade_recent_v2';
    var raw = localStorage.getItem(key);
    var list = raw ? JSON.parse(raw) : [];
    var id = gameId || location.pathname.split('/').slice(-2).join('/');
    if (id) {
      list = list.filter(function (item) { return item !== id; });
      list.unshift(id);
      localStorage.setItem(key, JSON.stringify(list.slice(0, 8)));
    }
  } catch (e) {}

  function mount() {
    if (!document.body) return;
    var host = document.createElement('div');
    host.id = 'pixel-arcade-floating-nav';
    host.style.cssText = 'position:fixed;z-index:2147483640;pointer-events:none;' +
      (pos.indexOf('bottom') === 0 ? 'bottom:max(14px,env(safe-area-inset-bottom,14px));' : 'top:max(14px,env(safe-area-inset-top,14px));') +
      (pos.indexOf('right') !== -1 ? 'right:max(14px,env(safe-area-inset-right,14px));' : 'left:max(14px,env(safe-area-inset-left,14px));');

    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var style = document.createElement('style');
    style.textContent = [
      '.pill {',
      '  pointer-events: auto;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  padding: 7px 13px;',
      '  border-radius: 999px;',
      '  background: rgba(9, 16, 29, 0.78);',
      '  backdrop-filter: blur(12px);',
      '  -webkit-backdrop-filter: blur(12px);',
      '  border: 1px solid rgba(125, 226, 255, 0.28);',
      '  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.42);',
      '  color: #eaf4ff;',
      '  font: 600 13px/1 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;',
      '  text-decoration: none;',
      '  letter-spacing: 0.02em;',
      '  cursor: pointer;',
      '  user-select: none;',
      '  -webkit-user-select: none;',
      '  transition: opacity 0.35s ease, transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;',
      '}',
      '.pill.idle { opacity: 0.46; }',
      '.pill:hover, .pill:focus-visible {',
      '  opacity: 1 !important;',
      '  transform: translateY(-1px);',
      '  background: rgba(15, 29, 50, 0.94);',
      '  border-color: rgba(125, 226, 255, 0.72);',
      '}',
      '.dot {',
      '  width: 7px; height: 7px; border-radius: 50%;',
      '  background: linear-gradient(135deg, #5ef2d6, #65b8ff);',
      '  box-shadow: 0 0 8px #5ef2d6;',
      '}',
      '@media (max-width: 600px) {',
      '  .pill { padding: 6px 10px; font-size: 12px; }',
      '}'
    ].join('\n');

    var link = document.createElement('a');
    link.className = 'pill';
    link.href = homeHref;
    link.title = '返回游戏大厅';
    link.innerHTML = '<span class="dot"></span><span>← 游戏大厅</span>';

    root.appendChild(style);
    root.appendChild(link);
    document.body.appendChild(host);

    var idleTimer = setTimeout(function () { link.classList.add('idle'); }, 3200);
    link.addEventListener('pointerenter', function () {
      clearTimeout(idleTimer);
      link.classList.remove('idle');
    });
    link.addEventListener('pointerleave', function () {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { link.classList.add('idle'); }, 2200);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
