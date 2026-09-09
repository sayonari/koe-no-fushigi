/* vad.js — 発話区間検出（VAD）共通モジュール（demo3・demo4 で共用）
 * KoeLab.createVAD(analyser, opts) … 適応ノイズ床＋ヒステリシスで発話 ON/OFF を検出する
 * KoeLab.debugAudioSource(url)     … マイクの代わりに wav を入力にする（?debug=1 用）
 */
(function (global) {
  'use strict';
  const KoeLab = global.KoeLab;

  const FRAME_MS = 20;          // 判定の間隔
  const BAND_LOW = 300;         // 声のエネルギーを見る帯域（Hz）
  const BAND_HIGH = 3400;
  const ON_CONTINUOUS_MS = 60;  // これだけ連続で on しきい値を超えたら speech ON
  const FAST_NOISE_ALPHA = 0.05;  // 非発話中のノイズ床の追従係数
  const SLOW_NOISE_ALPHA = 0.002; // 発話中のノイズ床の追従係数（ほぼ動かさない）
  const LONG_SPEECH_MS = 2500;    // これ以上続いたら定期コールバック
  const DEFAULT_CALIB_MS = 500;   // 初期ノイズ床の計測時間
  const DEFAULT_ON_MARGIN = 9;    // dB
  const DEFAULT_OFF_MARGIN = 4;   // dB
  const DEFAULT_HANGOVER = 200;   // ms

  function noop() {}

  KoeLab.createVAD = function (analyser, opts) {
    opts = opts || {};
    const audioCtx = analyser.context;
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const timeData = new Float32Array(analyser.fftSize);

    let onMargin = opts.onMargin != null ? opts.onMargin : DEFAULT_ON_MARGIN;
    const offMargin = opts.offMargin != null ? opts.offMargin : DEFAULT_OFF_MARGIN;
    const hangoverMs = opts.hangover != null ? opts.hangover : DEFAULT_HANGOVER;

    const cb = {
      onSpeechStart: opts.onSpeechStart || noop,
      onSpeechEnd: opts.onSpeechEnd || noop,
      onFrame: opts.onFrame || noop,
      onLongSpeech: opts.onLongSpeech || noop
    };

    let running = false;
    let intervalId = null;
    let startTime = 0;

    let calibrating = true;
    let calibStart = 0;
    let calibDurationMs = DEFAULT_CALIB_MS;
    let calibSum = 0;
    let calibCount = 0;

    let noise = null;         // ノイズ床（dB 相当）
    let aboveOnStart = 0;     // on しきい値を超え始めた時刻
    let belowOffStart = 0;    // off しきい値を下回り始めた時刻
    let speaking = false;
    let speechStartAt = 0;
    let lastLongSpeechAt = 0;
    let mutedUntil = 0;

    function byteToDb(byteAvg) {
      const range = (analyser.maxDecibels - analyser.minDecibels) || 70;
      return analyser.minDecibels + (byteAvg / 255) * range;
    }

    function bandLevelDb() {
      analyser.getByteFrequencyData(freqData);
      const sampleRate = audioCtx.sampleRate;
      const binHz = sampleRate / analyser.fftSize;
      const loBin = Math.max(0, Math.floor(BAND_LOW / binHz));
      const hiBin = Math.min(freqData.length - 1, Math.ceil(BAND_HIGH / binHz));
      let sum = 0;
      let count = 0;
      for (let i = loBin; i <= hiBin; i++) {
        sum += freqData[i];
        count++;
      }
      const avg = count ? sum / count : 0;
      return byteToDb(avg);
    }

    function currentRms() {
      analyser.getFloatTimeDomainData(timeData);
      let sum = 0;
      for (let i = 0; i < timeData.length; i++) {
        sum += timeData[i] * timeData[i];
      }
      return Math.sqrt(sum / timeData.length);
    }

    function resetCalibration(ms) {
      calibrating = true;
      calibStart = performance.now();
      calibDurationMs = ms || DEFAULT_CALIB_MS;
      calibSum = 0;
      calibCount = 0;
    }

    function tick() {
      const now = performance.now();
      const t = now - startTime;
      const level = bandLevelDb();
      const rms = currentRms();

      if (now < mutedUntil) {
        // 自分の再生音を拾わないよう，判定・ノイズ床更新の両方を止める
        cb.onFrame({ t: t, level: level, noise: noise == null ? level : noise, rms: rms, speaking: false, muted: true });
        return;
      }

      if (calibrating) {
        calibSum += level;
        calibCount++;
        if (now - calibStart >= calibDurationMs) {
          noise = calibCount ? calibSum / calibCount : level;
          calibrating = false;
        }
        cb.onFrame({ t: t, level: level, noise: noise == null ? level : noise, rms: rms, speaking: false, calibrating: true });
        return;
      }

      if (noise == null) noise = level;
      const alpha = speaking ? SLOW_NOISE_ALPHA : FAST_NOISE_ALPHA;
      noise = noise + alpha * (level - noise);

      const onThresh = noise + onMargin;
      const offThresh = noise + offMargin;

      if (level > onThresh) {
        if (!aboveOnStart) aboveOnStart = now;
        belowOffStart = 0;
        if (!speaking && (now - aboveOnStart) >= ON_CONTINUOUS_MS) {
          speaking = true;
          speechStartAt = aboveOnStart;
          lastLongSpeechAt = speechStartAt;
          cb.onSpeechStart(speechStartAt - startTime);
        }
      } else {
        aboveOnStart = 0;
      }

      if (speaking) {
        if (level < offThresh) {
          if (!belowOffStart) belowOffStart = now;
          if (now - belowOffStart >= hangoverMs) {
            // 発話の実際の終わり（hangover の開始時刻）を渡す．返事の「間」はここから測る
            const endAt = belowOffStart;
            const durMs = endAt - speechStartAt;
            speaking = false;
            belowOffStart = 0;
            aboveOnStart = 0;
            cb.onSpeechEnd(endAt - startTime, durMs, hangoverMs);
          }
        } else {
          belowOffStart = 0;
        }
        if (speaking) {
          const elapsed = now - speechStartAt;
          if (elapsed >= LONG_SPEECH_MS && (now - lastLongSpeechAt) >= LONG_SPEECH_MS) {
            lastLongSpeechAt = now;
            cb.onLongSpeech(now - startTime, elapsed);
          }
        }
      }

      cb.onFrame({ t: t, level: level, noise: noise, rms: rms, speaking: speaking });
    }

    return {
      start: function () {
        if (running) return;
        running = true;
        startTime = performance.now();
        speaking = false;
        aboveOnStart = 0;
        belowOffStart = 0;
        mutedUntil = 0;
        noise = null;
        resetCalibration(DEFAULT_CALIB_MS);
        intervalId = setInterval(tick, FRAME_MS);
      },
      stop: function () {
        running = false;
        if (intervalId) clearInterval(intervalId);
        intervalId = null;
      },
      mute: function (ms) {
        mutedUntil = performance.now() + ms;
      },
      recalibrate: function (ms) {
        resetCalibration(ms || 1000);
      },
      setOnMargin: function (v) { onMargin = v; },
      getOnMargin: function () { return onMargin; },
      isSpeaking: function () { return speaking; },
      isCalibrating: function () { return calibrating; },
      isRunning: function () { return running; }
    };
  };

  // ---- デバッグ用：マイクの代わりに wav を入力にする ----
  // ?debug=1 のときだけ使う（実機マイク無しでの動作確認用）
  KoeLab.debugAudioSource = function (url) {
    // wav を analyser（＝マイク入力の代わり）と出力へ流す
    let handle = null;
    return {
      play: function (analyser) {
        return KoeLab.playWav(url, { connectTo: analyser }).then(function (h) { handle = h; return h.ended; });
      },
      stop: function () { try { if (handle) handle.source.stop(); } catch (e) { /* 無視 */ } }
    };
  };

  KoeLab.isDebugMode = function () {
    try {
      return new URLSearchParams(location.search).get('debug') === '1';
    } catch (e) {
      return false;
    }
  };
})(window);
