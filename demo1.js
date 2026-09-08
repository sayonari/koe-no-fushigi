/* demo1.js — ①「こえを みる」（スペクトログラム） */
(function (global) {
  'use strict';
  const KoeLab = global.KoeLab;

  const MAX_FREQ = 8000; // 表示する周波数の上限（Hz）

  const Demo1 = {
    running: false,
    analyser: null,
    source: null,
    freqData: null,
    timeData: null,
    rafId: null,
    colorMode: 'jet', // 'jet' | 'gray'
    canvas: null,
    ctx: null
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

  function drawColumn() {
    const d = Demo1;
    if (!d.analyser) return;
    d.analyser.getByteFrequencyData(d.freqData);
    d.analyser.getByteTimeDomainData(d.timeData);

    const ctx = d.ctx;
    const canvas = d.canvas;
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

  function save() {
    const canvas = Demo1.canvas;
    if (!canvas) return;
    canvas.toBlob(function (blob) {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'koe-no-fushigi-spectrogram.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }, 'image/png');
  }

  function toggleColor() {
    Demo1.colorMode = Demo1.colorMode === 'jet' ? 'gray' : 'jet';
  }

  function init() {
    Demo1.canvas = $('specCanvas');
    Demo1.ctx = Demo1.canvas ? Demo1.canvas.getContext('2d') : null;
    if (Demo1.ctx) {
      Demo1.ctx.fillStyle = '#000';
      Demo1.ctx.fillRect(0, 0, Demo1.canvas.width, Demo1.canvas.height);
    }

    const startBtn = $('seeStartBtn');
    const stopBtn = $('seeStopBtn');
    const saveBtn = $('seeSaveBtn');
    const colorBtn = $('seeColorBtn');
    if (startBtn) startBtn.addEventListener('click', start);
    if (stopBtn) { stopBtn.addEventListener('click', stop); stopBtn.disabled = true; }
    if (saveBtn) saveBtn.addEventListener('click', save);
    if (colorBtn) colorBtn.addEventListener('click', toggleColor);

    const cards = document.querySelectorAll('#seeTopicCards .topic-card');
    const big = $('seeTopicBig');
    cards.forEach(function (btn) {
      btn.addEventListener('click', function () {
        cards.forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        if (big) big.textContent = btn.dataset.topic;
      });
    });
  }

  KoeLab.Demo1 = { init: init, start: start, stop: stop };
})(window);
