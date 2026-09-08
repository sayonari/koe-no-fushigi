/* demo4.js — ④「へんじの はやさ じっけん」 */
(function (global) {
  'use strict';
  const KoeLab = global.KoeLab;

  // 質問は VOICEVOX（ずんだもん）の wav を優先，無ければ speechSynthesis
  const QUESTIONS = [
    { text: 'きょうは なにを したの？', audio: 'audio/q1.wav' },
    { text: 'すきな たべものは なに？', audio: 'audio/q2.wav' },
    { text: 'さいきん うれしかったことは？', audio: 'audio/q3.wav' }
  ];
  const MIN_THRESHOLD = 0.02;
  const CALIBRATE_MS = 1500;
  const SPEECH_MIN_MS = 500;
  const SILENCE_MS = 300;
  const FAST_MS = 200;
  const SLOW_MS = 1500;

  const Demo4 = {
    running: false,
    analyser: null,
    source: null,
    timeData: null,
    rafId: null
  };

  function $(id) { return document.getElementById(id); }
  function shuffle2(a, b) { return Math.random() < 0.5 ? [a, b] : [b, a]; }

  function setStage(text) {
    const el = $('speedStage');
    if (el) el.textContent = text || '';
  }

  // speechSynthesis を Promise で待てるようにする
  function speakAndWait(text) {
    return new Promise(function (resolve) {
      if (!('speechSynthesis' in window)) { resolve(); return; }
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ja-JP';
      const voices = window.speechSynthesis.getVoices();
      const jaVoice = voices.find(function (v) { return v.lang === 'ja-JP'; });
      if (jaVoice) utter.voice = jaVoice;
      utter.onend = resolve;
      utter.onerror = resolve;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
      // フォールバック：onendが発火しない端末対策
      setTimeout(resolve, Math.max(2000, text.length * 300));
    });
  }

  function setupAnalyser() {
    return KoeLab.getMicStream().then(function (stream) {
      const audioCtx = KoeLab.getAudioContext();
      if (!Demo4.analyser) {
        Demo4.analyser = audioCtx.createAnalyser();
        Demo4.analyser.fftSize = 2048;
        Demo4.analyser.smoothingTimeConstant = 0.2;
        Demo4.timeData = new Uint8Array(Demo4.analyser.fftSize);
      }
      if (!Demo4.source) {
        Demo4.source = audioCtx.createMediaStreamSource(stream);
        Demo4.source.connect(Demo4.analyser);
      }
      return Demo4.analyser;
    });
  }

  // ノイズ床を測る
  function calibrateNoise(analyser) {
    return new Promise(function (resolve) {
      const samples = [];
      const startTime = performance.now();
      function tick() {
        analyser.getByteTimeDomainData(Demo4.timeData);
        samples.push(KoeLab.computeRMS(Demo4.timeData));
        updateLevelBar();
        if (performance.now() - startTime >= CALIBRATE_MS) {
          const avg = samples.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, samples.length);
          resolve(Math.max(avg * 3, MIN_THRESHOLD));
        } else {
          requestAnimationFrame(tick);
        }
      }
      tick();
    });
  }

  function updateLevelBar() {
    const bar = $('speedLevelBar');
    if (!bar || !Demo4.timeData) return;
    const rms = KoeLab.computeRMS(Demo4.timeData);
    bar.style.width = Math.min(100, Math.round(rms * 220)) + '%';
  }

  // 発話が始まって終わるまで待つ
  function waitForSpeechEnd(analyser, threshold) {
    return new Promise(function (resolve) {
      let speaking = false;
      let speechStart = 0;
      let silenceStart = 0;
      function tick() {
        analyser.getByteTimeDomainData(Demo4.timeData);
        const rms = KoeLab.computeRMS(Demo4.timeData);
        updateLevelBar();
        const now = performance.now();
        if (rms > threshold) {
          silenceStart = 0;
          if (!speechStart) speechStart = now;
          if (!speaking && now - speechStart >= SPEECH_MIN_MS) speaking = true;
        } else if (speaking) {
          if (!silenceStart) silenceStart = now;
          if (now - silenceStart >= SILENCE_MS) {
            resolve();
            return;
          }
        }
        Demo4.rafId = requestAnimationFrame(tick);
      }
      tick();
    });
  }

  async function respondWithDelay(delayMs) {
    await new Promise(function (r) { setTimeout(r, delayMs); });
    setStage('へえ！ そうなんだ！');
    await KoeLab.playAudioOrSpeak('audio/hee_sounanda.wav', 'へえ！ そうなんだ！', 'ja-JP');
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

  async function runExperiment() {
    if (Demo4.running) return;
    Demo4.running = true;
    $('speedStartBtn').disabled = true;
    $('speedVoteArea').hidden = true;
    $('speedReveal').textContent = '';

    try {
      const analyser = await setupAnalyser();
      // iOS対策：タップの中で音声合成に触れておく
      if ('speechSynthesis' in window) window.speechSynthesis.getVoices();

      setStage('しずかな音を はかっているよ…');
      const threshold = await calibrateNoise(analyser);

      const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
      const order = shuffle2(FAST_MS, SLOW_MS); // 例: [1500, 200]

      for (let round = 0; round < 2; round++) {
        setStage((round + 1) + 'かいめ：「' + question.text + '」');
        await KoeLab.playAudioOrSpeak(question.audio, question.text, 'ja-JP');
        setStage('こたえてね！');
        await waitForSpeechEnd(analyser, threshold);
        await respondWithDelay(order[round]);
        await new Promise(function (r) { setTimeout(r, 400); });
      }

      setStage('じっけん おわり！');
      Demo4.lastOrder = order; // [1かいめの遅延, 2かいめの遅延]
      $('speedVoteArea').hidden = false;
    } catch (err) {
      setStage(KoeLab.micErrorMessage(err));
    } finally {
      Demo4.running = false;
      $('speedStartBtn').disabled = false;
    }
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
      (isFast ? 'はやい（0.2秒）' : 'おそい（1.5秒）') + '」だったよ！';
    $('speedReveal').textContent = revealText;
  }

  function resetVotes() {
    KoeLab.storage.set('speedVoteStats', { fast: 0, slow: 0 });
    updateVoteBars();
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
  }

  function stop() {
    if (Demo4.rafId) cancelAnimationFrame(Demo4.rafId);
    Demo4.rafId = null;
    Demo4.running = false;
  }

  KoeLab.Demo4 = { init: init, start: function () {}, stop: stop };
})(window);
