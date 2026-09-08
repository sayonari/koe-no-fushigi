/* demo3.js — ③「あいづちくん と はなす」 */
(function (global) {
  'use strict';
  const KoeLab = global.KoeLab;

  const MIN_THRESHOLD = 0.02;      // ノイズ床がとても小さい時の下限
  const CALIBRATE_MS = 1500;       // ノイズ床を測る時間
  const SPEECH_MIN_MS = 500;       // これ以上続いたら「発話中」とみなす
  const LONG_SPEECH_MS = 3000;     // これ以上続いたら定期あいづちを入れる
  const PERIODIC_INTERVAL_MS = 2500;
  const MUTE_AFTER_MS = 400;       // あいづち再生後にマイク判定を止める時間

  const END_WORDS = [
    { file: 'hee.wav', text: 'へえ' },
    { file: 'sounanda.wav', text: 'そうなんだ' },
    { file: 'naruhodo.wav', text: 'なるほど' },
    { file: 'fuun.wav', text: 'ふーん' }
  ];
  const MID_WORDS = [
    { file: 'un.wav', text: 'うん' },
    { file: 'unun.wav', text: 'うんうん' },
    { file: 'hai.wav', text: 'はい' }
  ];

  const Demo3 = {
    running: false,
    analyser: null,
    source: null,
    timeData: null,
    rafId: null,
    noiseFloor: 0,
    threshold: MIN_THRESHOLD,
    calibrating: false,
    calibStart: 0,
    calibSamples: [],
    speaking: false,
    speechStartTime: 0,
    silenceStartTime: 0,
    lastPeriodicTime: 0,
    muted: false,
    delayMs: 500,
    aizuchiOn: true
  };

  function $(id) { return document.getElementById(id); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function setStatus(msg) {
    const el = $('aizuchiStatus');
    if (el) el.textContent = msg || '';
  }

  function setBubble(text) {
    const el = $('aizuchiBubble');
    if (el) el.textContent = text || '';
  }

  function playNod() {
    const face = $('aizuchiFace');
    if (!face) return;
    face.classList.remove('nod');
    // 強制再描画してからクラスを付け直す（アニメーション再生のため）
    void face.offsetWidth;
    face.classList.add('nod');
    const mouth = $('aizuchiMouth');
    if (mouth) {
      mouth.setAttribute('d', 'M 75 128 Q 100 150 125 128');
      setTimeout(function () {
        mouth.setAttribute('d', 'M 75 130 Q 100 130 125 130');
      }, 400);
    }
  }

  async function playAizuchi(word) {
    const d = Demo3;
    d.muted = true;
    setBubble(word.text);
    if (d.aizuchiOn) playNod();
    await KoeLab.playAudioOrSpeak('audio/' + word.file, word.text, 'ja-JP');
    setTimeout(function () {
      d.muted = false;
      d.speaking = false;
      d.speechStartTime = 0;
      d.silenceStartTime = 0;
    }, MUTE_AFTER_MS);
  }

  function analyze() {
    const d = Demo3;
    if (!d.analyser) return;
    d.analyser.getByteTimeDomainData(d.timeData);
    const rms = KoeLab.computeRMS(d.timeData);

    const levelBar = $('aizuchiLevelBar');
    if (levelBar) levelBar.style.width = Math.min(100, Math.round(rms * 220)) + '%';

    const now = performance.now();

    if (d.calibrating) {
      d.calibSamples.push(rms);
      if (now - d.calibStart >= CALIBRATE_MS) {
        const avg = d.calibSamples.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, d.calibSamples.length);
        d.noiseFloor = avg;
        d.threshold = Math.max(avg * 3, MIN_THRESHOLD);
        d.calibrating = false;
        setStatus('');
      }
      d.rafId = requestAnimationFrame(analyze);
      return;
    }

    if (d.muted) {
      d.rafId = requestAnimationFrame(analyze);
      return;
    }

    const face = $('aizuchiFace');
    const isLoud = rms > d.threshold;

    if (isLoud) {
      d.silenceStartTime = 0;
      if (!d.speechStartTime) d.speechStartTime = now;
      const duration = now - d.speechStartTime;

      if (duration >= SPEECH_MIN_MS && !d.speaking) {
        d.speaking = true;
        d.lastPeriodicTime = now;
        if (face) face.classList.add('listening');
      }

      if (d.speaking && duration >= LONG_SPEECH_MS && (now - d.lastPeriodicTime) >= PERIODIC_INTERVAL_MS) {
        d.lastPeriodicTime = now;
        if (d.aizuchiOn) {
          playAizuchi(pick(MID_WORDS));
        }
      }
    } else {
      if (d.speaking) {
        if (!d.silenceStartTime) d.silenceStartTime = now;
        if (now - d.silenceStartTime >= 300) {
          // 発話おわり
          const face2 = $('aizuchiFace');
          if (face2) face2.classList.remove('listening');
          if (d.aizuchiOn) {
            setTimeout(function () {
              if (d.running) playAizuchi(pick(END_WORDS));
            }, d.delayMs);
          } else {
            d.speaking = false;
            d.speechStartTime = 0;
          }
          d.silenceStartTime = 0;
          if (!d.aizuchiOn) { /* 何もしない：無反応モード */ }
        }
      } else {
        d.speechStartTime = 0;
      }
    }

    d.rafId = requestAnimationFrame(analyze);
  }

  function start() {
    const d = Demo3;
    if (d.running) return;
    setStatus('マイクを じゅんびしているよ…');

    KoeLab.getMicStream().then(function (stream) {
      const audioCtx = KoeLab.getAudioContext();
      if (!audioCtx) {
        setStatus('このブラウザでは マイクのかいせきが つかえないよ．');
        return;
      }
      if (!d.analyser) {
        d.analyser = audioCtx.createAnalyser();
        d.analyser.fftSize = 2048;
        d.analyser.smoothingTimeConstant = 0.2;
        d.timeData = new Uint8Array(d.analyser.fftSize);
      }
      if (!d.source) {
        d.source = audioCtx.createMediaStreamSource(stream);
        d.source.connect(d.analyser);
      }

      d.running = true;
      d.calibrating = true;
      d.calibStart = performance.now();
      d.calibSamples = [];
      d.speaking = false;
      d.speechStartTime = 0;
      d.silenceStartTime = 0;
      d.muted = false;
      setStatus('しずかな音を はかっているよ…（少し待ってね）');
      setBubble('');

      $('aizuchiStartBtn').disabled = true;
      $('aizuchiStopBtn').disabled = false;

      analyze();
    }).catch(function (err) {
      setStatus(KoeLab.micErrorMessage(err));
    });
  }

  function stop() {
    const d = Demo3;
    d.running = false;
    d.speaking = false;
    if (d.rafId) cancelAnimationFrame(d.rafId);
    d.rafId = null;
    const face = $('aizuchiFace');
    if (face) face.classList.remove('listening');
    setBubble('');
    const startBtn = $('aizuchiStartBtn');
    const stopBtn = $('aizuchiStopBtn');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  }

  function init() {
    const startBtn = $('aizuchiStartBtn');
    const stopBtn = $('aizuchiStopBtn');
    if (startBtn) startBtn.addEventListener('click', start);
    if (stopBtn) { stopBtn.addEventListener('click', stop); stopBtn.disabled = true; }

    const slider = $('aizuchiDelaySlider');
    const valueEl = $('aizuchiDelayValue');
    const presetBtns = document.querySelectorAll('.preset-btn');

    function setDelay(ms) {
      Demo3.delayMs = ms;
      if (slider) slider.value = ms;
      if (valueEl) valueEl.textContent = ms + ' ms';
      presetBtns.forEach(function (b) {
        b.classList.toggle('active', Number(b.dataset.delay) === ms);
      });
    }

    if (slider) {
      slider.addEventListener('input', function () { setDelay(Number(slider.value)); });
    }
    presetBtns.forEach(function (b) {
      b.addEventListener('click', function () { setDelay(Number(b.dataset.delay)); });
    });
    setDelay(500);

    const onOffToggle = $('aizuchiOnOffToggle');
    if (onOffToggle) {
      Demo3.aizuchiOn = onOffToggle.checked;
      onOffToggle.addEventListener('change', function () {
        Demo3.aizuchiOn = onOffToggle.checked;
      });
    }

    const cards = document.querySelectorAll('#aizuchiTopicCards .topic-card');
    const big = $('aizuchiTopicBig');
    cards.forEach(function (btn) {
      btn.addEventListener('click', function () {
        cards.forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        if (big) big.textContent = btn.dataset.topic;
      });
    });
  }

  KoeLab.Demo3 = { init: init, start: start, stop: stop };
})(window);
