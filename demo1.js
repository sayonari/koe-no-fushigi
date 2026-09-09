/* demo1.js — ①「こえを みる」（スペクトログラム） */
(function (global) {
  'use strict';
  const KoeLab = global.KoeLab;

  const MAX_FREQ = 8000; // 表示する周波数の上限（Hz）
  const TOPICS = ['あ〜', 'い〜', 'う〜', 'え〜', 'お〜', '高い声', '低い声', '拍手', '口笛', 'ささやき声'];

  const Demo1 = {
    running: false,
    analyser: null,
    source: null,
    audioCtx: null,
    freqData: null,
    timeData: null,
    rafId: null,
    colorMode: 'jet', // 'jet' | 'gray'
    canvas: null,     // 画面に見えている表示用 canvas
    ctx: null,
    activeTopic: TOPICS[0],
    offscreens: {},   // topic -> { canvas, ctx, recorded }
    compareMode: false
  };

  function $(id) { return document.getElementById(id); }

  function jetColor(t) {
    t = Math.max(0, Math.min(1, t));
    const r = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 3)));
    const g = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 2)));
    const b = Math.max(0, Math.min(1, 1.5 - Math.abs(4 * t - 1)));
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  function grayColor(t) {
    const v = Math.round(Math.max(0, Math.min(1, t)) * 255);
    return [v, v, v];
  }

  function setStatus(msg) {
    const el = $('seeStatus');
    if (el) el.textContent = msg || '';
  }

  // ---- お題ごとのオフスクリーン canvas ----
  function getOffscreen(topic) {
    let o = Demo1.offscreens[topic];
    if (!o) {
      const c = document.createElement('canvas');
      c.width = Demo1.canvas.width;
      c.height = Demo1.canvas.height;
      const cx = c.getContext('2d');
      cx.fillStyle = '#000';
      cx.fillRect(0, 0, c.width, c.height);
      o = { canvas: c, ctx: cx, recorded: false };
      Demo1.offscreens[topic] = o;
    }
    return o;
  }

  // 表示 canvas に，指定したお題の絵（録音済みならその絵，未録音ならプレースホルダ）を出す
  function renderTopicToDisplay(topic) {
    const ctx = Demo1.ctx;
    const canvas = Demo1.canvas;
    if (!ctx || !canvas) return;
    const o = getOffscreen(topic);
    if (o.recorded) {
      ctx.drawImage(o.canvas, 0, 0);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#888';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ここに あなたの「' + topic + '」が 出るよ', canvas.width / 2, canvas.height / 2);
    }
  }

  function drawColumn() {
    const d = Demo1;
    if (!d.analyser) return;
    d.analyser.getByteFrequencyData(d.freqData);
    d.analyser.getByteTimeDomainData(d.timeData);

    const o = getOffscreen(d.activeTopic);
    const ctx = o.ctx;
    const canvas = o.canvas;
    const w = canvas.width;
    const h = canvas.height;

    // 左へ1pxずらす（右から流れてくる見た目にする）
    ctx.drawImage(canvas, -1, 0);

    const sampleRate = d.audioCtx.sampleRate;
    const binHz = sampleRate / d.analyser.fftSize;
    const colorFn = d.colorMode === 'jet' ? jetColor : grayColor;

    const colImg = ctx.createImageData(1, h);
    let peakBin = 0;
    let peakVal = 0;

    for (let y = 0; y < h; y++) {
      const freq = (1 - y / h) * MAX_FREQ; // 上が高い音
      const bin = Math.round(freq / binHz);
      const mag = bin < d.freqData.length ? d.freqData[bin] : 0;
      if (mag > peakVal) { peakVal = mag; peakBin = bin; }
      const t = mag / 255;
      const [r, g, b] = colorFn(t);
      const idx = y * 4;
      colImg.data[idx] = r;
      colImg.data[idx + 1] = g;
      colImg.data[idx + 2] = b;
      colImg.data[idx + 3] = 255;
    }
    ctx.putImageData(colImg, w - 1, 0);
    o.recorded = true;

    // アクティブなお題の canvas を表示 canvas へコピー
    d.ctx.drawImage(canvas, 0, 0);

    // 音の大きさ・ピーク周波数の表示
    const rms = KoeLab.computeRMS(d.timeData);
    const levelBar = $('seeLevelBar');
    if (levelBar) levelBar.style.width = Math.min(100, Math.round(rms * 220)) + '%';
    const peakEl = $('seePeakFreq');
    if (peakEl) peakEl.textContent = peakVal > 10 ? Math.round(peakBin * binHz) + ' Hz' : '-- Hz';

    d.rafId = requestAnimationFrame(drawColumn);
  }

  function start() {
    const d = Demo1;
    if (d.running) return;
    setStatus('マイクを じゅんびしているよ…');

    KoeLab.getMicStream().then(function (stream) {
      const audioCtx = KoeLab.getAudioContext();
      if (!audioCtx) {
        setStatus('このブラウザでは 音のかいせきが つかえないよ．');
        return;
      }
      d.audioCtx = audioCtx;
      if (!d.analyser) {
        d.analyser = audioCtx.createAnalyser();
        d.analyser.fftSize = 2048;
        d.analyser.smoothingTimeConstant = 0;
        d.freqData = new Uint8Array(d.analyser.frequencyBinCount);
        d.timeData = new Uint8Array(d.analyser.fftSize);
      }
      if (!d.source) {
        d.source = audioCtx.createMediaStreamSource(stream);
        d.source.connect(d.analyser);
      }
      d.running = true;
      setStatus('');
      $('seeStartBtn').disabled = true;
      $('seeStopBtn').disabled = false;
      drawColumn();
    }).catch(function (err) {
      setStatus(KoeLab.micErrorMessage(err));
    });
  }

  function stop() {
    const d = Demo1;
    d.running = false;
    if (d.rafId) cancelAnimationFrame(d.rafId);
    d.rafId = null;
    const startBtn = $('seeStartBtn');
    const stopBtn = $('seeStopBtn');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  }

  function clearActiveTopic() {
    const o = getOffscreen(Demo1.activeTopic);
    o.ctx.fillStyle = '#000';
    o.ctx.fillRect(0, 0, o.canvas.width, o.canvas.height);
    o.recorded = false;
    renderTopicToDisplay(Demo1.activeTopic);
  }

  function save() {
    const d = Demo1;
    const o = getOffscreen(d.activeTopic);
    // お題ラベルを左上に焼き込んだコピーを作って保存する
    const tmp = document.createElement('canvas');
    tmp.width = o.canvas.width;
    tmp.height = o.canvas.height;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(o.canvas, 0, 0);
    tctx.font = 'bold 22px sans-serif';
    tctx.textAlign = 'left';
    tctx.fillStyle = 'rgba(0,0,0,0.6)';
    tctx.fillRect(0, 0, 160, 34);
    tctx.fillStyle = '#fff';
    tctx.fillText(d.activeTopic, 10, 24);

    tmp.toBlob(function (blob) {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'koe-no-fushigi-' + d.activeTopic + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }, 'image/png');
  }

  function toggleColor() {
    Demo1.colorMode = Demo1.colorMode === 'jet' ? 'gray' : 'jet';
  }

  function selectTopic(topic) {
    Demo1.activeTopic = topic;
    renderTopicToDisplay(topic);
    const cards = document.querySelectorAll('#seeTopicCards .topic-card');
    cards.forEach(function (b) { b.classList.toggle('selected', b.dataset.topic === topic); });
    const big = $('seeTopicBig');
    if (big) big.textContent = topic;
  }

  // ---- くらべるモード ----
  function recordedTopics() {
    return TOPICS.filter(function (t) { return Demo1.offscreens[t] && Demo1.offscreens[t].recorded; });
  }

  function enterCompareMode() {
    stop();
    Demo1.compareMode = true;
    $('seeLiveWrap').hidden = true;
    $('seeLiveAxisX').hidden = true;
    $('seeLiveMeters').hidden = true;
    $('seeLiveBtns').hidden = true;
    $('seeTopicCards').hidden = true;
    $('seeTopicBig').hidden = true;
    const area = $('seeCompareArea');
    area.hidden = false;

    const checksEl = $('seeCompareChecks');
    checksEl.innerHTML = '';
    const recorded = recordedTopics();
    if (!recorded.length) {
      checksEl.innerHTML = '<p>まだ 録ったお題が ないよ．先に「始める」で 録ってみてね．</p>';
    }
    recorded.forEach(function (topic) {
      const label = document.createElement('label');
      label.className = 'compare-check-item';
      label.innerHTML = '<input type="checkbox" value="' + topic + '"> ' + topic;
      checksEl.appendChild(label);
    });
    $('seeCompareResult').innerHTML = '';
  }

  function exitCompareMode() {
    Demo1.compareMode = false;
    $('seeLiveWrap').hidden = false;
    $('seeLiveAxisX').hidden = false;
    $('seeLiveMeters').hidden = false;
    $('seeLiveBtns').hidden = false;
    $('seeTopicCards').hidden = false;
    $('seeTopicBig').hidden = false;
    $('seeCompareArea').hidden = true;
    renderTopicToDisplay(Demo1.activeTopic);
  }

  function showCompare() {
    const checked = Array.prototype.slice.call(
      document.querySelectorAll('#seeCompareChecks input:checked')
    ).map(function (el) { return el.value; });

    const resultEl = $('seeCompareResult');
    if (checked.length < 2) {
      resultEl.innerHTML = '<p class="status-msg">2つ いじょう えらんでね</p>';
      return;
    }
    if (checked.length > 4) {
      resultEl.innerHTML = '<p class="status-msg">4つまで えらんでね</p>';
      return;
    }
    resultEl.innerHTML = '';
    checked.forEach(function (topic) {
      const o = getOffscreen(topic);
      const wrap = document.createElement('div');
      wrap.className = 'compare-row';
      const labelEl = document.createElement('div');
      labelEl.className = 'compare-row-label';
      labelEl.textContent = topic;
      const c = document.createElement('canvas');
      c.width = o.canvas.width;
      c.height = o.canvas.height;
      c.className = 'compare-row-canvas';
      c.getContext('2d').drawImage(o.canvas, 0, 0);
      wrap.appendChild(labelEl);
      wrap.appendChild(c);
      resultEl.appendChild(wrap);
    });
  }

  function init() {
    Demo1.canvas = $('specCanvas');
    Demo1.ctx = Demo1.canvas ? Demo1.canvas.getContext('2d') : null;
    renderTopicToDisplay(Demo1.activeTopic);

    const startBtn = $('seeStartBtn');
    const stopBtn = $('seeStopBtn');
    const saveBtn = $('seeSaveBtn');
    const colorBtn = $('seeColorBtn');
    const clearBtn = $('seeClearBtn');
    const compareBtn = $('seeCompareBtn');
    const compareShowBtn = $('seeCompareShowBtn');
    const compareBackBtn = $('seeCompareBackBtn');
    if (startBtn) startBtn.addEventListener('click', start);
    if (stopBtn) { stopBtn.addEventListener('click', stop); stopBtn.disabled = true; }
    if (saveBtn) saveBtn.addEventListener('click', save);
    if (colorBtn) colorBtn.addEventListener('click', toggleColor);
    if (clearBtn) clearBtn.addEventListener('click', clearActiveTopic);
    if (compareBtn) compareBtn.addEventListener('click', enterCompareMode);
    if (compareShowBtn) compareShowBtn.addEventListener('click', showCompare);
    if (compareBackBtn) compareBackBtn.addEventListener('click', exitCompareMode);

    const cards = document.querySelectorAll('#seeTopicCards .topic-card');
    cards.forEach(function (btn) {
      btn.addEventListener('click', function () { selectTopic(btn.dataset.topic); });
    });
    selectTopic(Demo1.activeTopic);
  }

  KoeLab.Demo1 = { init: init, start: start, stop: stop };
})(window);
