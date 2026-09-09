/* demo3.js — ③「あいづちくん と はなす」（vad.js / strip.js を利用） */
(function (global) {
  'use strict';
  const KoeLab = global.KoeLab;

  const MIN_SPEECH_MS = 300;     // これ未満は咳・物音として無視
  const REPEAT_GUARD_MS = 1500;  // 直前の相槌からこの時間内は定期あいづちを出さない

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
    vad: null,
    strip: null,
    stripRafId: null,
    delayMs: 400,
    aizuchiOn: true,
    lastEndWord: null,
    lastAizuchiAt: 0,
    debugSource: null
  };

  function $(id) { return document.getElementById(id); }
  function pick(arr, avoid) {
    let choices = arr;
    if (avoid) {
      const filtered = arr.filter(function (w) { return w.file !== avoid.file; });
      if (filtered.length) choices = filtered;
    }
    return choices[Math.floor(Math.random() * choices.length)];
  }

  function setStatus(msg) {
    const el = $('aizuchiStatus');
    if (el) el.textContent = msg || '';
  }

  function setStateBig(msg) {
    const el = $('aizuchiStateBig');
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
    void face.offsetWidth; // 強制再描画してからクラスを付け直す（アニメーション再生のため）
    face.classList.add('nod');
    const mouth = $('aizuchiMouth');
    if (mouth) {
      mouth.setAttribute('d', 'M 75 128 Q 100 150 125 128');
      setTimeout(function () {
        mouth.setAttribute('d', 'M 75 130 Q 100 130 125 130');
      }, 400);
    }
  }

  async function playAizuchi(word, markerT) {
    const d = Demo3;
    setBubble(word.text);
    if (d.aizuchiOn) playNod();
    if (d.strip) d.strip.addMarker(markerT, word.text, '#e65100');
    setStateBig('（あいづち）');
    if (d.vad) d.vad.mute(5000); // 自分の声を拾わないよう再生中は判定を止める
    await KoeLab.playAudioOrSpeak('audio/' + word.file, word.text, 'ja-JP');
    if (d.vad) d.vad.mute(300);
    d.lastAizuchiAt = performance.now();
  }

  function handleSpeechStart() {
    setStateBig('はなしてるね！');
    const face = $('aizuchiFace');
    if (face) face.classList.add('listening');
  }

  function handleSpeechEnd(t, durMs, hangoverMs) {
    const d = Demo3;
    const face = $('aizuchiFace');
    if (face) face.classList.remove('listening');
    setStateBig('きいてるよ…');
    if (durMs < MIN_SPEECH_MS) return; // 咳・物音は無視
    if (!d.aizuchiOn) return;
    // t は発話の実際の終わり．検出には hangover 分すでに経っているので，その分を差し引いて待つ
    const wait = Math.max(0, d.delayMs - (hangoverMs || 0));
    setTimeout(function () {
      if (!d.running) return;
      const word = pick(END_WORDS, d.lastEndWord);
      d.lastEndWord = word;
      playAizuchi(word, t);
    }, wait);
  }

  function handleLongSpeech(t) {
    const d = Demo3;
    if (!d.aizuchiOn) return;
    if (performance.now() - d.lastAizuchiAt < REPEAT_GUARD_MS) return;
    playAizuchi(pick(MID_WORDS), t);
  }

  function handleFrame(f) {
    const d = Demo3;
    const levelBar = $('aizuchiLevelBar');
    if (levelBar) levelBar.style.width = Math.min(100, Math.round(f.rms * 220)) + '%';
    if (d.strip) d.strip.pushFrame(f);
    if (f.calibrating) { setStateBig('しずかにしてね…'); d.wasCalibrating = true; }
    else if (d.wasCalibrating) { d.wasCalibrating = false; setStateBig('きいてるよ…'); }
  }

  function stripLoop() {
    if (Demo3.strip) Demo3.strip.render(performance.now() - (Demo3.stripStart || 0));
    Demo3.stripRafId = requestAnimationFrame(stripLoop);
  }

  function setupVad(analyser) {
    const d = Demo3;
    const sens = $('aizuchiSensSlider');
    d.vad = KoeLab.createVAD(analyser, {
      onMargin: sens ? Number(sens.value) : 9,
      onSpeechStart: handleSpeechStart,
      onSpeechEnd: handleSpeechEnd,
      onLongSpeech: handleLongSpeech,
      onFrame: handleFrame
    });
    return d.vad;
  }

  // analyser・vad を用意する（マイクの有無に関係なく呼べる：デバッグ用に必須）
  function ensureAnalyserAndVad() {
    const d = Demo3;
    const audioCtx = KoeLab.getAudioContext();
    if (!d.analyser) {
      d.analyser = audioCtx.createAnalyser();
      d.analyser.fftSize = 1024;
      d.analyser.smoothingTimeConstant = 0;
    }
    if (!d.vad) setupVad(d.analyser);
    return d.analyser;
  }

  // 画面まわりの共通の「開始」処理（マイク／デバッグ音源どちらでも呼ぶ）
  function beginRunningUi() {
    const d = Demo3;
    d.running = true;
    KoeLab.preloadWavs(['un','unun','hai','hee','sounanda','fuun','naruhodo'].map(function (n) { return 'audio/' + n + '.wav'; }));
    setStatus('');
    setBubble('');
    setStateBig('しずかにしてね…');

    $('aizuchiStartBtn').disabled = true;
    $('aizuchiStopBtn').disabled = false;

    if (!d.strip) {
      const canvas = $('aizuchiStripCanvas');
      if (canvas) d.strip = KoeLab.createStrip(canvas, { windowMs: 8000, tracks: 1 });
    }
    d.stripStart = performance.now();
    d.vad.start();
    if (!d.stripRafId) stripLoop();
  }

  function start() {
    const d = Demo3;
    if (d.running) return;
    setStatus('マイクを じゅんびしているよ…');

    KoeLab.getMicStream().then(function (stream) {
      const analyser = ensureAnalyserAndVad();
      if (!analyser) {
        setStatus('このブラウザでは マイクのかいせきが つかえないよ．');
        return;
      }
      if (!d.source) {
        const audioCtx = KoeLab.getAudioContext();
        d.source = audioCtx.createMediaStreamSource(stream);
        d.source.connect(analyser);
      }
      beginRunningUi();
    }).catch(function (err) {
      setStatus(KoeLab.micErrorMessage(err));
    });
  }

  function stop() {
    const d = Demo3;
    d.running = false;
    if (d.vad) d.vad.stop();
    if (d.stripRafId) cancelAnimationFrame(d.stripRafId);
    d.stripRafId = null;
    const face = $('aizuchiFace');
    if (face) face.classList.remove('listening');
    setBubble('');
    setStateBig('');
    const startBtn = $('aizuchiStartBtn');
    const stopBtn = $('aizuchiStopBtn');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  }

  function initDebugButton() {
    if (!KoeLab.isDebugMode()) return;
    const btnRow = document.querySelector('#panel-aizuchi .btn-row');
    if (!btnRow) return;
    const btn = document.createElement('button');
    btn.className = 'big-btn btn-secondary';
    btn.textContent = '🧪 テスト音源で再生（audio/q3.wav）';
    btnRow.appendChild(btn);
    btn.addEventListener('click', function () {
      const d = Demo3;
      // マイクを使わず，analyser・vad だけ用意して動かす（マイク無し実機確認用）
      if (!d.running) {
        ensureAnalyserAndVad();
        beginRunningUi();
      }
      const waitCalib = setInterval(function () {
        if (!d.vad) return;
        if (d.vad.isCalibrating()) return;
        clearInterval(waitCalib);
        if (d.debugSource) d.debugSource.stop();
        d.debugSource = KoeLab.debugAudioSource('audio/q3.wav');
        d.debugSource.play(d.analyser);
      }, 50);
    });
  }

  function init() {
    const startBtn = $('aizuchiStartBtn');
    const stopBtn = $('aizuchiStopBtn');
    if (startBtn) startBtn.addEventListener('click', start);
    if (stopBtn) { stopBtn.addEventListener('click', stop); stopBtn.disabled = true; }

    const slider = $('aizuchiDelaySlider');
    const valueEl = $('aizuchiDelayValue');
    const presetBtns = document.querySelectorAll('#panel-aizuchi .preset-btn');

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
    setDelay(400);

    const onOffToggle = $('aizuchiOnOffToggle');
    if (onOffToggle) {
      Demo3.aizuchiOn = onOffToggle.checked;
      onOffToggle.addEventListener('change', function () {
        Demo3.aizuchiOn = onOffToggle.checked;
      });
    }

    const sensSlider = $('aizuchiSensSlider');
    const sensValue = $('aizuchiSensValue');
    if (sensSlider) {
      sensSlider.addEventListener('input', function () {
        const v = Number(sensSlider.value);
        if (sensValue) sensValue.textContent = v + ' dB';
        if (Demo3.vad) Demo3.vad.setOnMargin(v);
      });
    }

    const calibBtn = $('aizuchiCalibBtn');
    if (calibBtn) {
      calibBtn.addEventListener('click', function () {
        if (Demo3.vad) {
          Demo3.vad.recalibrate(1000);
          setStateBig('しずかにしてね…');
        }
      });
    }

    const detailToggle = $('aizuchiDetailToggle');
    if (detailToggle) {
      detailToggle.addEventListener('change', function () {
        if (Demo3.strip) Demo3.strip.setDetail(detailToggle.checked);
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

    initDebugButton();
  }

  KoeLab.Demo3 = { init: init, start: start, stop: stop, _d: Demo3 };
})(window);
