/* strip.js — スクロール波形ストリップ（demo3・demo4 共用）
 * KoeLab.createStrip(canvas, opts)     … 右から左へ流れるライブ表示（直近 windowMs）
 * KoeLab.drawStaticTimeline(canvas, data) … demo4 の「1回・2回目」比較用の静止画タイムライン
 */
(function (global) {
  'use strict';
  const KoeLab = global.KoeLab;

  // ---- ライブ・スクロールストリップ ----
  KoeLab.createStrip = function (canvas, opts) {
    opts = opts || {};
    const windowMs = opts.windowMs || 8000;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    let tracks = opts.tracks || 1;
    let showDetail = !!opts.showDetail;
    const frames = [];   // {t, level, noise, rms, speaking}
    const markers = [];  // {t, label, color, dashed}
    const sysBlocks = []; // {start, end, label, color}（track2用）

    function pushFrame(f) {
      frames.push(f);
      const cutoff = f.t - windowMs * 1.5;
      while (frames.length && frames[0].t < cutoff) frames.shift();
    }

    function addMarker(t, label, color, dashed) {
      markers.push({ t: t, label: label, color: color || '#e65100', dashed: !!dashed });
      const cutoff = t - windowMs * 1.5;
      while (markers.length && markers[0].t < cutoff) markers.shift();
    }

    function addSystemBlock(startT, endT, label, color) {
      sysBlocks.push({ start: startT, end: endT, label: label, color: color || '#43a047' });
    }

    function clear() {
      frames.length = 0;
      markers.length = 0;
      sysBlocks.length = 0;
    }

    function timeToX(t, nowT) {
      return w - ((nowT - t) / windowMs) * w;
    }

    function render(nowT) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);

      // 1秒ごとの薄い目盛り
      ctx.strokeStyle = '#eee';
      ctx.lineWidth = 1;
      for (let s = 0; s <= windowMs / 1000; s++) {
        const x = timeToX(nowT - s * 1000, nowT);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      const track1H = tracks === 2 ? h * 0.55 : h;
      const track1Base = track1H;
      const track2Top = track1H + 4;
      const track2H = h - track2Top;

      // 発話中の帯（薄い色）
      ctx.fillStyle = 'rgba(251,140,0,0.15)';
      let bandStart = null;
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        if (f.speaking && bandStart == null) bandStart = f.t;
        if ((!f.speaking || i === frames.length - 1) && bandStart != null) {
          const endT = f.speaking ? nowT : f.t;
          const x1 = timeToX(bandStart, nowT);
          const x2 = timeToX(endT, nowT);
          ctx.fillRect(Math.min(x1, x2), 0, Math.max(1, x2 - x1), track1H);
          bandStart = null;
        }
      }

      // RMS 包絡（塗り）
      ctx.fillStyle = 'rgba(33,150,243,0.55)';
      ctx.beginPath();
      ctx.moveTo(w, track1Base);
      for (let i = frames.length - 1; i >= 0; i--) {
        const f = frames[i];
        const x = timeToX(f.t, nowT);
        if (x < -10) break;
        const y = track1Base - Math.min(1, f.rms * 4) * (track1H - 6);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(0, track1Base);
      ctx.closePath();
      ctx.fill();

      // しきい値ライン（くわしくトグル時のみ）
      if (showDetail && frames.length) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#9e9e9e';
        ctx.beginPath();
        for (let i = frames.length - 1; i >= 0; i--) {
          const f = frames[i];
          const x = timeToX(f.t, nowT);
          if (x < -10) break;
          const dbRange = 60; // 表示用の適当なスケール（下端=noise-10dB 上端=noise+50dB 目安）
          const y = track1Base - Math.max(0, Math.min(1, (f.noise - (f.noise - 10)) / dbRange)) * (track1H - 6);
          if (i === frames.length - 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // マーカー（縦線＋ラベル）
      ctx.textAlign = 'center';
      ctx.font = 'bold 12px sans-serif';
      markers.forEach(function (m) {
        const x = timeToX(m.t, nowT);
        if (x < -20 || x > w + 20) return;
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 2;
        if (m.dashed) ctx.setLineDash([4, 3]); else ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, track1H);
        ctx.stroke();
        ctx.setLineDash([]);
        if (m.label) {
          ctx.fillStyle = m.color;
          ctx.fillText(m.label, Math.max(16, Math.min(w - 16, x)), 12);
        }
      });

      // トラック2（システム音声の再生区間ブロック）
      if (tracks === 2) {
        ctx.strokeStyle = '#ccc';
        ctx.beginPath();
        ctx.moveTo(0, track1H + 2);
        ctx.lineTo(w, track1H + 2);
        ctx.stroke();

        sysBlocks.forEach(function (b) {
          const x1 = timeToX(b.start, nowT);
          const x2 = timeToX(b.end, nowT);
          if (x2 < -20 || x1 > w + 20) return;
          ctx.fillStyle = b.color;
          ctx.fillRect(Math.min(x1, x2), track2Top, Math.max(2, Math.abs(x2 - x1)), track2H);
          if (b.label) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText(b.label, (x1 + x2) / 2, track2Top + track2H / 2 + 4);
          }
        });
        // 古いブロックを間引く
        const cutoff = nowT - windowMs * 1.5;
        while (sysBlocks.length && sysBlocks[0].end < cutoff) sysBlocks.shift();
      }
    }

    return {
      pushFrame: pushFrame,
      addMarker: addMarker,
      addSystemBlock: addSystemBlock,
      setTracks: function (n) { tracks = n; },
      setDetail: function (v) { showDetail = !!v; },
      clear: clear,
      render: render
    };
  };

  // ---- 静止画タイムライン（demo4：1回目・2回目の比較） ----
  // data = {
  //   startT, endT,                    // 表示する時間範囲（ms, その回の開始からの相対時間）
  //   userFrames: [{t, rms, speaking}],
  //   sysBlocks: [{start, end, label, color}],
  //   speechEndT, replyStartT,         // 両矢印を結ぶ2点
  //   delayLabel, delayColor
  // }
  KoeLab.drawStaticTimeline = function (canvas, data) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);

    const range = Math.max(1, data.endT - data.startT);
    function tx(t) { return ((t - data.startT) / range) * w; }

    const userTop = 0;
    const userH = h * 0.45;
    const sysTop = h * 0.55;
    const sysH = h * 0.3;
    const arrowY = h - 14;

    // ラベル
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#555';
    ctx.textAlign = 'left';
    ctx.fillText('あなた', 4, 12);

    // ユーザ発話帯＋包絡
    ctx.fillStyle = 'rgba(251,140,0,0.18)';
    let bandStart = null;
    (data.userFrames || []).forEach(function (f, i) {
      if (f.speaking && bandStart == null) bandStart = f.t;
      if ((!f.speaking || i === data.userFrames.length - 1) && bandStart != null) {
        const endT = f.speaking ? f.t : f.t;
        ctx.fillRect(tx(bandStart), userTop, Math.max(1, tx(endT) - tx(bandStart)), userH);
        bandStart = null;
      }
    });
    ctx.strokeStyle = '#2196f3';
    ctx.lineWidth = 1.5;
    // ユーザの包絡．AI が話している間（muted）はマイクが AI の声を拾うので，薄い灰色で描いて区別する
    const frames = data.userFrames || [];
    function drawEnvelope(pred, color) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      let pen = false;
      frames.forEach(function (f) {
        const x = tx(f.t);
        const y = userTop + userH - Math.min(1, f.rms * 4) * (userH - 4);
        if (pred(f)) { if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; } }
        else pen = false;
      });
      ctx.stroke();
    }
    drawEnvelope(function (f) { return !f.muted; }, ctx.strokeStyle);
    drawEnvelope(function (f) { return !!f.muted; }, 'rgba(0,0,0,0.18)');

    // AI 側（質問・返事ブロック）
    ctx.fillStyle = '#555';
    ctx.fillText('AI', 4, sysTop - 2);
    (data.sysBlocks || []).forEach(function (b) {
      ctx.fillStyle = b.color || '#43a047';
      const x1 = tx(b.start);
      const x2 = tx(b.end);
      ctx.fillRect(Math.min(x1, x2), sysTop, Math.max(2, Math.abs(x2 - x1)), sysH);
      if (b.label) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(b.label, (x1 + x2) / 2, sysTop + sysH / 2 + 4);
      }
    });

    // 両矢印（発話終わり → 返事はじまり）
    if (data.speechEndT != null && data.replyStartT != null) {
      const x1 = tx(data.speechEndT);
      const x2 = tx(data.replyStartT);
      ctx.strokeStyle = data.delayColor || '#333';
      ctx.fillStyle = data.delayColor || '#333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, arrowY);
      ctx.lineTo(x2, arrowY);
      ctx.stroke();
      [x1, x2].forEach(function (x, idx) {
        const dir = idx === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x, arrowY);
        ctx.lineTo(x + dir * 6, arrowY - 4);
        ctx.lineTo(x + dir * 6, arrowY + 4);
        ctx.closePath();
        ctx.fill();
      });
      // ラベルは矢印の上に白地で置く（短い矢印でも読めるように）
      const label = data.delayLabel || '';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(label).width + 12;
      const cx = Math.max(tw / 2 + 2, Math.min(w - tw / 2 - 2, (x1 + x2) / 2));
      const ly = arrowY - 9;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(cx - tw / 2, ly - 15, tw, 20);
      ctx.fillStyle = data.delayColor || '#333';
      ctx.fillText(label, cx, ly);
    }
  };
})(window);
