/* demo2.js — ②「AIが きいて・やくして・はなす」 */
(function (global) {
  'use strict';
  const KoeLab = global.KoeLab;

  const Demo2 = {
    recognition: null,
    running: false,
    interimEl: null
  };

  // 声を選ぶセレクトに出す言語一覧（AI翻訳の対象言語＋日本語）
  const VOICE_LANGS = [
    { value: 'ja-JP', label: '日本語' },
    { value: 'en-US', label: '英語' },
    { value: 'zh-CN', label: '中国語' },
    { value: 'ko-KR', label: '韓国語' },
    { value: 'es-ES', label: 'スペイン語' },
    { value: 'fr-FR', label: 'フランス語' }
  ];

  function $(id) { return document.getElementById(id); }

  // 言語コード（'en' 等）から VOICE_LANGS の詳細ロケールへ
  function toDetailedLang(lang) {
    const found = VOICE_LANGS.find(function (v) { return v.value.indexOf(lang) === 0; });
    return found ? found.value : (lang.indexOf('-') >= 0 ? lang : lang + '-' + lang.toUpperCase());
  }

  function savedVoiceURI(lang) {
    const map = KoeLab.storage.get('aiVoiceMap', {});
    return map[lang];
  }
  function saveVoiceURI(lang, uri) {
    const map = KoeLab.storage.get('aiVoiceMap', {});
    map[lang] = uri;
    KoeLab.storage.set('aiVoiceMap', map);
  }

  function populateVoiceSelect() {
    const langSel = $('aiVoiceLangSelect');
    const voiceSel = $('aiVoiceSelect');
    if (!langSel || !voiceSel) return;
    const lang = toDetailedLang(langSel.value);
    const voices = KoeLab.listVoices(lang);
    voiceSel.innerHTML = '';
    if (!voices.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '（この端末には声が見つからないよ）';
      voiceSel.appendChild(opt);
      return;
    }
    const saved = savedVoiceURI(lang);
    voices.forEach(function (v) {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = v.name + '（' + v.lang + '）';
      voiceSel.appendChild(opt);
    });
    if (saved && voices.some(function (v) { return v.voiceURI === saved; })) {
      voiceSel.value = saved;
    } else {
      voiceSel.value = voices[0].voiceURI; // pickVoice の結果と一致
    }
  }

  function currentVoiceURI(lang) {
    const detailed = toDetailedLang(lang);
    const saved = savedVoiceURI(detailed);
    if (saved) return saved;
    return null; // KoeLab.speak 側で pickVoice に任せる
  }

  function setStatus(msg) {
    const el = $('aiStatus');
    if (el) el.textContent = msg || '';
  }

  // タイムアウト付き fetch
  function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, ms || 6000);
    return fetch(url, { signal: controller.signal }).finally(function () {
      clearTimeout(timer);
    });
  }

  // 翻訳：(1) Chrome組み込み Translator API → (2) Google翻訳(非公式) → (3) MyMemory
  async function translateText(text, tl) {
    if (!text || !text.trim()) return '';

    // (1) Chrome 組み込み Translator API
    try {
      if ('Translator' in self) {
        const availability = await self.Translator.availability({
          sourceLanguage: 'ja',
          targetLanguage: tl
        });
        if (availability && availability !== 'unavailable') {
          const translator = await self.Translator.create({
            sourceLanguage: 'ja',
            targetLanguage: tl
          });
          const result = await translator.translate(text);
          if (result) return result;
        }
      }
    } catch (e) { /* 次の方法へ */ }

    // (2) Google翻訳（非公式エンドポイント）
    try {
      const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=' +
        encodeURIComponent(tl) + '&dt=t&q=' + encodeURIComponent(text);
      const res = await fetchWithTimeout(url, 6000);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const joined = data[0].map(function (chunk) { return chunk[0]; }).join('');
          if (joined) return joined;
        }
      }
    } catch (e) { /* 次の方法へ */ }

    // (3) MyMemory
    try {
      const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) +
        '&langpair=ja|' + encodeURIComponent(tl);
      const res = await fetchWithTimeout(url, 6000);
      if (res.ok) {
        const data = await res.json();
        if (data && data.responseData && data.responseData.translatedText) {
          return data.responseData.translatedText;
        }
      }
    } catch (e) { /* すべて失敗 */ }

    return null; // 失敗
  }

  function addResultCard(originalText) {
    const list = $('aiResultList');
    if (!list) return null;
    const card = document.createElement('div');
    card.className = 'ai-result-card';
    card.innerHTML =
      '<div class="ai-result-original"></div>' +
      '<div class="ai-result-translation">やくしているよ…</div>' +
      '<button class="ai-speak-btn" hidden>🔊 きく</button>';
    card.querySelector('.ai-result-original').textContent = originalText;
    list.insertBefore(card, list.firstChild);

    // 表示しすぎないように直近5件だけ残す
    while (list.children.length > 5) {
      list.removeChild(list.lastChild);
    }
    return card;
  }

  async function handleFinalResult(text) {
    // 自動読み上げ中にスピーカーの声をマイクが拾って再認識するループを防ぐ
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) return;
    const card = addResultCard(text);
    if (!card) return;
    const translationEl = card.querySelector('.ai-result-translation');
    const speakBtn = card.querySelector('.ai-speak-btn');

    const langSelect = $('aiLangSelect');
    const tl = langSelect ? langSelect.value : 'none';

    let speakText = text;
    let speakLang = 'ja-JP';

    if (tl === 'none') {
      translationEl.textContent = '';
    } else {
      const translated = await translateText(text, tl);
      if (translated) {
        translationEl.textContent = translated;
        speakText = translated;
        speakLang = tl;
      } else {
        translationEl.textContent = 'やくせなかった…';
      }
    }

    speakBtn.hidden = false;
    speakBtn.addEventListener('click', function () {
      KoeLab.speakLong(speakText, speakLang, { voiceURI: currentVoiceURI(speakLang) });
    });

    const autoSpeak = $('aiAutoSpeakToggle');
    if (autoSpeak && autoSpeak.checked) {
      KoeLab.speakLong(speakText, speakLang, { voiceURI: currentVoiceURI(speakLang) });
    }
  }

  function renderInterim(text) {
    let el = $('aiInterimLine');
    const list = $('aiResultList');
    if (!list) return;
    if (!el) {
      el = document.createElement('div');
      el.id = 'aiInterimLine';
      el.className = 'ai-result-interim';
      list.insertBefore(el, list.firstChild);
    }
    el.textContent = text;
  }

  function clearInterim() {
    const el = $('aiInterimLine');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function start() {
    const d = Demo2;
    if (d.running) return;

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      $('aiUnsupported').hidden = false;
      return;
    }
    $('aiUnsupported').hidden = true;

    // iOS対策：タップの中で speechSynthesis / AudioContext に触れておく
    KoeLab.getAudioContext();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }

    if (!d.recognition) {
      d.recognition = new Recognition();
      d.recognition.lang = 'ja-JP';
      d.recognition.continuous = true;
      d.recognition.interimResults = true;

      d.recognition.onresult = function (event) {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            clearInterim();
            handleFinalResult(res[0].transcript.trim());
          } else {
            interim += res[0].transcript;
          }
        }
        if (interim) renderInterim(interim);
      };

      d.recognition.onerror = function (event) {
        if (event.error === 'not-allowed' || event.error === 'permission-denied') {
          setStatus('マイクを「ゆるす」にしてね．');
        } else if (event.error === 'no-speech') {
          // 無音は無視して続ける
        } else {
          setStatus('うまく きこえなかったよ…もう一回 話してみてね．');
        }
      };

      d.recognition.onend = function () {
        clearInterim();
        if (d.running) {
          // continuous でも途切れることがあるので再開する
          try { d.recognition.start(); } catch (e) { /* 既に動いている場合は無視 */ }
        }
      };
    }

    try {
      d.recognition.start();
      d.running = true;
      setStatus('');
      $('aiStartBtn').disabled = true;
      $('aiStopBtn').disabled = false;
    } catch (e) {
      setStatus('うまく はじめられなかったよ．もう一度 ためしてね．');
    }
  }

  function stop() {
    const d = Demo2;
    d.running = false;
    if (d.recognition) {
      try { d.recognition.stop(); } catch (e) { /* 無視 */ }
    }
    clearInterim();
    const startBtn = $('aiStartBtn');
    const stopBtn = $('aiStopBtn');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  }

  function init() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      const el = $('aiUnsupported');
      if (el) el.hidden = false;
    }

    const startBtn = $('aiStartBtn');
    const stopBtn = $('aiStopBtn');
    if (startBtn) startBtn.addEventListener('click', start);
    if (stopBtn) { stopBtn.addEventListener('click', stop); stopBtn.disabled = true; }

    const cards = document.querySelectorAll('#aiTopicCards .topic-card');
    const big = $('aiTopicBig');
    cards.forEach(function (btn) {
      btn.addEventListener('click', function () {
        cards.forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        if (big) big.textContent = btn.dataset.topic;
      });
    });

    // 声を選ぶセレクト
    const voiceLangSel = $('aiVoiceLangSelect');
    const voiceSel = $('aiVoiceSelect');
    if (voiceLangSel && voiceSel) {
      voiceLangSel.addEventListener('change', populateVoiceSelect);
      voiceSel.addEventListener('change', function () {
        const lang = toDetailedLang(voiceLangSel.value);
        saveVoiceURI(lang, voiceSel.value);
      });
      populateVoiceSelect();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.addEventListener('voiceschanged', populateVoiceSelect);
      }
    }

    // メモの保存・復元
    const memo = $('aiMemoInput');
    if (memo) {
      memo.value = KoeLab.storage.get('aiMemo', '');
      memo.addEventListener('input', function () {
        KoeLab.storage.set('aiMemo', memo.value);
      });
    }
  }

  KoeLab.Demo2 = { init: init, start: start, stop: stop, translateText: translateText };
})(window);
