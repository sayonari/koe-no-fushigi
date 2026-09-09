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

  // ---- 声（Voice）を品質順で選ぶ ----
  // 優先順：(1) Google (2) Natural/Neural/Online/Premium/Enhanced
  //         (3) macOS高品質声 (4) クラウド声 (5) それ以外／compactは最後
  function scoreVoice(v) {
    const name = v.name || '';
    if (/compact/i.test(name)) return -1000;
    let score = 0;
    if (/Google/.test(name)) score += 100;
    if (/Natural|Neural|Online|Premium|Enhanced/i.test(name)) score += 80;
    if (/Samantha|Alex|Daniel|Karen|Kyoko|Otoya/.test(name)) score += 60;
    if (!v.localService) score += 20;
    return score;
  }

  KoeLab.pickVoice = function (lang) {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    const short = (lang || 'ja-JP').split('-')[0];
    let candidates = voices.filter(function (v) { return v.lang === lang; });
    if (!candidates.length) {
      candidates = voices.filter(function (v) { return v.lang && v.lang.indexOf(short) === 0; });
    }
    if (!candidates.length) return null;
    candidates.sort(function (a, b) { return scoreVoice(b) - scoreVoice(a); });
    return candidates[0];
  };

  // 言語ごとの声の候補一覧（品質順）。UI のセレクトに使う
  KoeLab.listVoices = function (lang) {
    if (!('speechSynthesis' in window)) return [];
    const voices = window.speechSynthesis.getVoices() || [];
    const short = (lang || 'ja-JP').split('-')[0];
    const candidates = voices.filter(function (v) { return v.lang && v.lang.indexOf(short) === 0; });
    candidates.sort(function (a, b) { return scoreVoice(b) - scoreVoice(a); });
    return candidates;
  };

  function resolveVoice(utterLang, voiceURI) {
    if (voiceURI && 'speechSynthesis' in window) {
      const voices = window.speechSynthesis.getVoices() || [];
      const match = voices.find(function (v) { return v.voiceURI === voiceURI; });
      if (match) return match;
    }
    return KoeLab.pickVoice(utterLang);
  }

  // ---- speechSynthesis 共通ヘルパー ----
  KoeLab.speak = function (text, lang, opts) {
    if (!('speechSynthesis' in window)) return false;
    opts = opts || {};
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang || 'ja-JP';
    utter.rate = opts.rate || 0.95;
    utter.pitch = opts.pitch != null ? opts.pitch : 1.0;

    const voice = resolveVoice(utter.lang, opts.voiceURI);
    if (voice) utter.voice = voice;
    window.speechSynthesis.cancel(); // 前の読み上げが残っていたら止める
    window.speechSynthesis.speak(utter);
    return true;
  };

  // 長い文を文末（。．.！!？?）で分割して連続再生する
  function splitSentences(text) {
    const parts = [];
    let buf = '';
    for (const ch of text) {
      buf += ch;
      if (/[。．.！!？?]/.test(ch)) { parts.push(buf); buf = ''; }
    }
    if (buf.trim()) parts.push(buf);
    return parts.map(function (s) { return s.trim(); }).filter(Boolean);
  }

  KoeLab.speakLong = function (text, lang, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!('speechSynthesis' in window) || !text) { resolve(); return; }
      const parts = splitSentences(text);
      if (!parts.length) { resolve(); return; }
      window.speechSynthesis.cancel();
      let i = 0;
      function next() {
        if (i >= parts.length) { resolve(); return; }
        const utter = new SpeechSynthesisUtterance(parts[i]);
        utter.lang = lang || 'ja-JP';
        utter.rate = opts.rate || 0.95;
        utter.pitch = opts.pitch != null ? opts.pitch : 1.0;
        const voice = resolveVoice(utter.lang, opts.voiceURI);
        if (voice) utter.voice = voice;
        utter.onend = function () { i++; next(); };
        utter.onerror = function () { i++; next(); };
        window.speechSynthesis.speak(utter);
      }
      next();
    });
  };

  // 音声再生：wav があれば再生，無ければ speechSynthesis にフォールバック
  // ---- wav の再生は Web Audio（fetch + decodeAudioData + BufferSource）で行う ----
  // <audio> 要素はブラウザ/環境によって読み込みが止まることがあり，タイミングも不正確なため
  const wavCache = {};
  KoeLab.loadWav = function (path) {
    if (!wavCache[path]) {
      wavCache[path] = fetch(path).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      }).then(function (buf) {
        const ctx = KoeLab.getAudioContext();
        return new Promise(function (resolve, reject) {
          // Safari 旧版はコールバック形式のみ
          const p = ctx.decodeAudioData(buf, resolve, reject);
          if (p && p.then) p.then(resolve, reject);
        });
      });
      wavCache[path].catch(function () { delete wavCache[path]; });
    }
    return wavCache[path];
  };
  KoeLab.preloadWavs = function (paths) {
    paths.forEach(function (p) { KoeLab.loadWav(p).catch(function () {}); });
  };
  // 再生．戻り値：{ ended: Promise, duration, startedAt(performance.now基準), source }
  KoeLab.playWav = function (path, opts) {
    opts = opts || {};
    const ctx = KoeLab.getAudioContext();
    return KoeLab.loadWav(path).then(function (buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      if (opts.connectTo) src.connect(opts.connectTo);
      const ended = new Promise(function (resolve) { src.onended = resolve; });
      const startedAt = performance.now();
      src.start();
      return { ended: ended, duration: buffer.duration * 1000, startedAt: startedAt, source: src };
    });
  };

  // wav があれば再生，無ければ speechSynthesis にフォールバック．終了時に resolve
  KoeLab.playAudioOrSpeak = function (audioPath, fallbackText, fallbackLang) {
    return KoeLab.playWav(audioPath).then(function (h) {
      return h.ended;
    }).catch(function () {
      KoeLab.speak(fallbackText, fallbackLang || 'ja-JP');
      return new Promise(function (resolve) { setTimeout(resolve, 600); });
    });
  };

  global.KoeLab = KoeLab;
})(window);
