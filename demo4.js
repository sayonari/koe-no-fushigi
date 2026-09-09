/* demo4.js — ④「へんじの はやさ じっけん」（vad.js / strip.js を利用） */
(function (global) {
  'use strict';
  const KoeLab = global.KoeLab;

  // 質問は VOICEVOX（ずんだもん）の wav を優先，無ければ speechSynthesis
  const QUESTIONS = [
    { text: 'きょうは なにを したの？', audio: 'audio/q1.wav' },
    { text: 'すきな たべものは なに？', audio: 'audio/q2.wav' },
    { text: 'さいきん うれしかったことは？', audio: 'audio/q3.wav' }
  ];
  const FAST_MS = 200;
  const SLOW_MS = 3000;
  const SPEECH_TIMEOUT_MS = 8000; // これだけ発話が検出できなければ案内を出す

  const Demo4 = {
    running: false,
    analyser: null,
    source: null,
    vad: null,
    vadStartTime: 0,
    speechEndWaiters: [],
    currentRoundFrames: [],
    recording: false,
    lastOrder: null,
    roundsData: [null, null],
    debugSource: null
  };

  function $(id) { return document.getElementById(id); }
  function shuffle2(a, b) { return Math.random() < 0.5 ? [a, b] : [b, a]; }

  function setStage(text) {
    const el = $('speedStage');
    if (el) el.textContent = text || '';
  }

  function vadNow() { return performance.now() - Demo4.vadStartTime; }

  function updateLevelBarFrame(f) {
    const bar = $('speedLevelBar');
    if (bar) bar.style.width = Math.min(100, Math.round(f.rms * 220)) + '%';
  }

  function setupVad() {
    Demo4.vad = KoeLab.createVAD(Demo4.analyser, {
      onSpeechStart: function () {
        if (KoeLab.isDebugMode()) setStage('（デバッグ）speech START');
      },
      onSpeechEnd: function (t, durMs, hangoverMs) {
        if (KoeLab.isDebugMode()) setStage('（デバッグ）speech END ' + Math.round(durMs) + 'ms');
        if (durMs < 300) return; // 短い物音は無視して待ち続ける
        const waiter = Demo4.speechEndWaiters.shift();
        if (waiter) waiter.resolve({ t: t, durMs: durMs, hangoverMs: hangoverMs });
      },
      onFrame: function (f) {
        updateLevelBarFrame(f);
        if (Demo4.recording) Demo4.currentRoundFrames.push(f);
      }
    });
    Demo4.vadStartTime = performance.now();
    Demo4.vad.start();
  }

  // analyser・vad を用意する（マイクの有無に関係なく呼べる：デバッグ用に必須）
  function ensureAnalyserAndVad() {
    const audioCtx = KoeLab.getAudioContext();
    if (!Demo4.analyser) {
      Demo4.analyser = audioCtx.createAnalyser();
      Demo4.analyser.fftSize = 1024;
      Demo4.analyser.smoothingTimeConstant = 0;
    }
    if (!Demo4.vad) {
      setupVad();
    } else {
      Demo4.vad.recalibrate(500);
    }
    return Demo4.analyser;
  }

  function setupAnalyserAndVad() {
    return KoeLab.getMicStream().then(function (stream) {
      const analyser = ensureAnalyserAndVad();
      if (!Demo4.source) {
        const audioCtx = KoeLab.getAudioContext();
        Demo4.source = audioCtx.createMediaStreamSource(stream);
        Demo4.source.connect(analyser);
      }
      setStage('しずかな音を はかっているよ…');
      return waitCalibration();
    });
  }

  function waitCalibration() {
    return new Promise(function (resolve) {
      const iv = setInterval(function () {
        if (!Demo4.vad || !Demo4.vad.isCalibrating()) {
          clearInterval(iv);
          resolve();
        }
      }, 50);
    });
  }

  function waitForSpeechEnd(timeoutMs) {
    return new Promise(function (resolve, reject) {
      const waiter = { resolve: null };
      const timer = setTimeout(function () {
        const idx = Demo4.speechEndWaiters.indexOf(waiter);
        if (idx >= 0) Demo4.speechEndWaiters.splice(idx, 1);
        reject(new Error('TIMEOUT'));
      }, timeoutMs);
      waiter.resolve = function (v) {
        clearTimeout(timer);
        resolve(v);
      };
      Demo4.speechEndWaiters.push(waiter);
    });
  }

  // 再生中〜再生後300msは vad の判定を止める（スピーカー音の拾い込み対策）
  async function playTrackedAudio(path, fallbackText, label, color) {
    if (Demo4.vad) Demo4.vad.mute(30000);
    const start = vadNow();
    await KoeLab.playAudioOrSpeak(path, fallbackText, 'ja-JP');
    const end = vadNow();
    if (Demo4.vad) Demo4.vad.mute(300);
    return { start: start, end: end, label: label, color: color };
  }

  function updateVoteBars() {
    const stats = KoeLab.storage.get('speedVoteStats', { fast: 0, slow: 0 });
    const total = stats.fast + stats.slow;
    const fastPct = total ? Math.round((stats.fast / total) * 100) : 0;
    const slowPct = total ? Math.round((stats.slow / total) * 100) : 0;
    $('speedFastBar').style.width = fastPct + '%';
    $('speedSlowBar').style.width = slowPct + '%';
    $('speedFastCount').textContent = stats.fast + '票';
    $('speedSlowCount').textContent = stats.slow + '票';
    return stats;
  }

  async function runRound(question, delayMs, roundIndex) {
    Demo4.currentRoundFrames = [];
    Demo4.recording = true;
    const roundStartT = vadNow();

    setStage((roundIndex + 1) + 'かいめ：「' + question.text + '」');
    const qBlock = await playTrackedAudio(question.audio, question.text, 'しつもん', '#43a047');

    setStage('こたえてね！');
    if (Demo4.debugNoMic) {
      setTimeout(function () {
        if (Demo4.debugSource) Demo4.debugSource.stop();
        Demo4.debugSource = KoeLab.debugAudioSource('audio/q3.wav');
        Demo4.debugSource.play(Demo4.analyser);
      }, 500);
    }
    let speechEndInfo;
    try {
      speechEndInfo = await waitForSpeechEnd(SPEECH_TIMEOUT_MS);
    } finally {
      // タイムアウトでも記録は止める
    }

    const hang = (speechEndInfo && speechEndInfo.hangoverMs) || 0;
    await new Promise(function (r) { setTimeout(r, Math.max(0, delayMs - hang)); });
    const isFast = delayMs === FAST_MS;
    setStage('へえ！ そうなんだ！');
    const replyBlock = await playTrackedAudio(
      'audio/hee_sounanda.wav', 'へえ！ そうなんだ！', 'へんじ', isFast ? '#2196f3' : '#ff9800'
    );

    Demo4.recording = false;
    const roundEndT = vadNow();

    Demo4.roundsData[roundIndex] = {
      startT: roundStartT,
      endT: roundEndT,
      userFrames: Demo4.currentRoundFrames.slice(),
      sysBlocks: [qBlock, replyBlock],
      speechEndT: speechEndInfo.t,
      replyStartT: replyBlock.start,
      delayLabel: '間 ' + (delayMs / 1000).toFixed(1) + '秒',
      delayColor: isFast ? '#2196f3' : '#ff9800'
    };

    await new Promise(function (r) { setTimeout(r, 400); });
  }

  async function runExperiment() {
    KoeLab.preloadWavs(['audio/q1.wav','audio/q2.wav','audio/q3.wav','audio/hee_sounanda.wav']);
    if (Demo4.running) return;
    Demo4.running = true;
    $('speedStartBtn').disabled = true;
    $('speedVoteArea').hidden = true;
    $('speedTimelines').hidden = true;
    $('speedReveal').textContent = '';

    try {
      if (Demo4.debugNoMic) {
        ensureAnalyserAndVad();
        setStage('（デバッグ）しずかな音を はかっているよ…');
        await waitCalibration();
      } else {
        await setupAnalyserAndVad();
      }
      // iOS対策：タップの中で音声合成に触れておく
      if ('speechSynthesis' in window) window.speechSynthesis.getVoices();

      const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
      const order = shuffle2(FAST_MS, SLOW_MS); // 例: [3000, 200]

      for (let round = 0; round < 2; round++) {
        await runRound(question, order[round], round);
      }

      setStage('じっけん おわり！');
      Demo4.lastOrder = order; // [1かいめの遅延, 2かいめの遅延]
      $('speedVoteArea').hidden = false;
    } catch (err) {
      if (err && err.message === 'TIMEOUT') {
        setStage('声が 聞こえなかったよ．感度を 上げて もう一回 ためしてね．');
      } else {
        setStage(KoeLab.micErrorMessage(err));
      }
    } finally {
      Demo4.running = false;
      $('speedStartBtn').disabled = false;
    }
  }

  function renderTimelines() {
    const d1 = Demo4.roundsData[0];
    const d2 = Demo4.roundsData[1];
    const c1 = $('speedTimeline1');
    const c2 = $('speedTimeline2');
    const l1 = $('speedTimeline1Label');
    const l2 = $('speedTimeline2Label');
    if (!d1 || !d2 || !c1 || !c2 || !Demo4.lastOrder) return;
    const order = Demo4.lastOrder;
    l1.textContent = '1かいめ（' + (order[0] === FAST_MS ? 'はやい 0.2秒' : 'おそい 3.0秒') + '）';
    l2.textContent = '2かいめ（' + (order[1] === FAST_MS ? 'はやい 0.2秒' : 'おそい 3.0秒') + '）';
    KoeLab.drawStaticTimeline(c1, d1);
    KoeLab.drawStaticTimeline(c2, d2);
    $('speedTimelines').hidden = false;
  }

  function vote(roundIndex) {
    const order = Demo4.lastOrder;
    if (!order) return;
    const delay = order[roundIndex];
    const isFast = delay === FAST_MS;

    const stats = KoeLab.storage.get('speedVoteStats', { fast: 0, slow: 0 });
    if (isFast) stats.fast += 1; else stats.slow += 1;
    KoeLab.storage.set('speedVoteStats', stats);
    updateVoteBars();

    const revealText = (roundIndex === 0 ? '1かいめ' : '2かいめ') + 'は「' +
      (isFast ? '速い（0.2秒）' : '遅い（3.0秒）') + '」だったよ！';
    $('speedReveal').textContent = revealText;

    renderTimelines();
  }

  function resetVotes() {
    KoeLab.storage.set('speedVoteStats', { fast: 0, slow: 0 });
    updateVoteBars();
  }

  function initDebugButton() {
    if (!KoeLab.isDebugMode()) return;
    const btnRow = document.querySelector('#panel-speed .btn-row');
    if (!btnRow) return;
    const btn = document.createElement('button');
    btn.className = 'big-btn btn-secondary';
    btn.textContent = '🧪 テスト音源で再生（audio/q3.wav）';
    btnRow.appendChild(btn);
    btn.addEventListener('click', function () {
      // マイクを使わず，「答え」の代わりに q3.wav を流して実験を最後まで通す
      Demo4.debugNoMic = true;
      runExperiment();
    });
  }

  function init() {
    const startBtn = $('speedStartBtn');
    if (startBtn) startBtn.addEventListener('click', runExperiment);

    const voteABtn = $('speedVoteABtn');
    const voteBBtn = $('speedVoteBBtn');
    if (voteABtn) voteABtn.addEventListener('click', function () { vote(0); });
    if (voteBBtn) voteBBtn.addEventListener('click', function () { vote(1); });

    const resetBtn = $('speedResetBtn');
    if (resetBtn) resetBtn.addEventListener('click', resetVotes);

    updateVoteBars();
    initDebugButton();
  }

  function stop() {
    if (Demo4.vad) Demo4.vad.stop();
    Demo4.running = false;
  }

  KoeLab.Demo4 = { init: init, start: function () {}, stop: stop, _d: Demo4 };
})(window);
