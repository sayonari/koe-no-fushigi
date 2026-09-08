/* common.js
 * ぜんぶのデモで つかう共通の道具たち
 * - AudioContext / マイクストリームの共有管理
 * - iOS対応（タップの中で resume する）
 * - 音量メーターの計算（RMS）
 */
(function (global) {
  'use strict';

  const KoeLab = {};

  // ---- AudioContext（ぜんぶのデモで共有） ----
  let audioCtx = null;

  KoeLab.getAudioContext = function () {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    // iOS Safari 対策：ユーザー操作の中で必ず resume する
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function () { /* 失敗しても無視 */ });
    }
    return audioCtx;
  };

  // ---- マイクストリーム（デモ間で共有） ----
  let micStream = null;
  let micPromise = null;

  KoeLab.getMicStream = function () {
    if (micStream) return Promise.resolve(micStream);
    if (micPromise) return micPromise;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('NO_GUM'));
    }

    micPromise = navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false
      }
    }).then(function (stream) {
      micStream = stream;
      micPromise = null;
      return stream;
    }).catch(function (err) {
      micPromise = null;
      throw err;
    });

    return micPromise;
  };

  // マイクを完全に止めたい時だけ呼ぶ（普段はデモ間で使い回す）
  KoeLab.releaseMicStream = function () {
    if (micStream) {
      micStream.getTracks().forEach(function (t) { t.stop(); });
      micStream = null;
    }
  };

  // マイク許可エラーを子どもにも分かるメッセージに変換
  KoeLab.micErrorMessage = function (err) {
    const name = err && err.name ? err.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'マイクが つかえないよ．ブラウザの せっていで マイクを「ゆるす」にしてね．';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'マイクが 見つからないよ．マイクのある たんまつで ためしてね．';
    }
    if (err && err.message === 'NO_GUM') {
      return 'このブラウザでは マイクが つかえないよ．Chrome か Safari で ひらいてね．';
    }
    if (!window.isSecureContext) {
      return 'マイクを つかうには https（あんぜんな通信）が ひつようだよ．';
    }
    return 'マイクが つかえなかったよ．もういちど ためしてね．';
  };

  // ---- RMS（音の大きさ）を計算するヘルパー ----
  KoeLab.computeRMS = function (timeDomainData) {
    // timeDomainData は Uint8Array（AnalyserNode.getByteTimeDomainData 用）
    let sum = 0;
    for (let i = 0; i < timeDomainData.length; i++) {
      const v = (timeDomainData[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / timeDomainData.length);
  };

  // ---- localStorage 安全ラッパー ----
  KoeLab.storage = {
    get: function (key, fallback) {
      try {
        const v = window.localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* 保存できなくても動作は続ける */ }
    }
  };

  // ---- speechSynthesis 共通ヘルパー ----
  KoeLab.speak = function (text, lang, opts) {
    if (!('speechSynthesis' in window)) return false;
    opts = opts || {};
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang || 'ja-JP';
    if (opts.rate) utter.rate = opts.rate;
    if (opts.pitch) utter.pitch = opts.pitch;

    // 指定した言語に近い声があれば選ぶ
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length) {
      const match = voices.find(function (v) { return v.lang === utter.lang; }) ||
                    voices.find(function (v) { return v.lang && v.lang.indexOf(utter.lang.split('-')[0]) === 0; });
      if (match) utter.voice = match;
    }
    window.speechSynthesis.cancel(); // 前の読み上げが残っていたら止める
    window.speechSynthesis.speak(utter);
    return true;
  };

  // 音声再生：wav があれば再生，無ければ speechSynthesis にフォールバック
  KoeLab.playAudioOrSpeak = function (audioPath, fallbackText, fallbackLang) {
    return new Promise(function (resolve) {
      const audio = new Audio(audioPath);
      let done = false;
      const finish = function () {
        if (done) return;
        done = true;
        resolve();
      };
      audio.addEventListener('ended', finish);
      audio.addEventListener('error', function () {
        if (done) return;
        done = true;
        KoeLab.speak(fallbackText, fallbackLang || 'ja-JP');
        // speechSynthesis は非同期に終わるが，ここでは体感上すぐ次に進めてよい
        setTimeout(resolve, 600);
      });
      const p = audio.play();
      if (p && p.catch) {
        p.catch(function () {
          if (done) return;
          done = true;
          KoeLab.speak(fallbackText, fallbackLang || 'ja-JP');
          setTimeout(resolve, 600);
        });
      }
    });
  };

  global.KoeLab = KoeLab;
})(window);
