/* app.js — タブ切り替え・せんせいモード・全体の初期化 */
(function (global) {
  'use strict';
  const KoeLab = global.KoeLab;

  const TABS = ['see', 'ai', 'aizuchi', 'speed'];
  const DEMO_MODULES = {
    see: 'Demo1',
    ai: 'Demo2',
    aizuchi: 'Demo3',
    speed: 'Demo4'
  };

  let currentTab = 'see';

  function $(id) { return document.getElementById(id); }

  function getDemoModule(tab) {
    const key = DEMO_MODULES[tab];
    return key ? KoeLab[key] : null;
  }

  function switchTab(tab) {
    if (!TABS.includes(tab)) tab = 'see';
    if (tab === currentTab) return;

    // 使っていないデモの処理を止める（マイクストリーム自体は共有して残す）
    const prevDemo = getDemoModule(currentTab);
    if (prevDemo && typeof prevDemo.stop === 'function') {
      prevDemo.stop();
    }

    currentTab = tab;

    document.querySelectorAll('.demo-section').forEach(function (section) {
      section.classList.toggle('active', section.dataset.panel === tab);
    });
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    if (location.hash !== '#' + tab) {
      history.replaceState(null, '', '#' + tab);
    }
  }

  function initTabNav() {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(btn.dataset.tab);
      });
    });

    window.addEventListener('hashchange', function () {
      const tab = location.hash.replace('#', '');
      switchTab(tab);
    });

    const initialTab = location.hash.replace('#', '') || 'see';
    // 初回は currentTab と同じでも表示状態を確定させる
    document.querySelectorAll('.demo-section').forEach(function (section) {
      section.classList.toggle('active', section.dataset.panel === (TABS.includes(initialTab) ? initialTab : 'see'));
    });
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tab === (TABS.includes(initialTab) ? initialTab : 'see'));
    });
    currentTab = TABS.includes(initialTab) ? initialTab : 'see';
  }

  function initSenseiMode() {
    const toggle = $('senseiModeToggle');
    if (!toggle) return;

    const params = new URLSearchParams(location.search);
    const forcedBig = params.get('big') === '1';
    const saved = KoeLab.storage.get('senseiMode', false);
    const enabled = forcedBig || saved;

    toggle.checked = enabled;
    document.body.classList.toggle('big-mode', enabled);

    toggle.addEventListener('change', function () {
      document.body.classList.toggle('big-mode', toggle.checked);
      KoeLab.storage.set('senseiMode', toggle.checked);
    });
  }

  function initAll() {
    initTabNav();
    initSenseiMode();

    if (KoeLab.Demo1) KoeLab.Demo1.init();
    if (KoeLab.Demo2) KoeLab.Demo2.init();
    if (KoeLab.Demo3) KoeLab.Demo3.init();
    if (KoeLab.Demo4) KoeLab.Demo4.init();

    // ページを離れる時はマイクを解放する
    window.addEventListener('pagehide', function () {
      KoeLab.releaseMicStream();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})(window);
