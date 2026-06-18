// ==UserScript==
// @name         virtualABC Submission Reporter
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  AtCoderの提出結果を virtualABC サーバーに報告し、リアルタイム順位表を実現します。元の traQ 通知も任意で併用できます。
// @author       traP
// @match        https://atcoder.jp/contests/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      q.trap.jp
// @connect      kenkoooo.com
// ==/UserScript==

(function () {
  'use strict';

  // ===== 設定 =====================================================
  // virtualABC サーバーのURL（デプロイ先に合わせて変更）
  const VABC_API = 'http://localhost:3000';
  // マイページで取得した自分のトークンを貼り付ける
  const VABC_TOKEN = 'PASTE_YOUR_TOKEN_HERE';

  // （任意）traQ 通知も使う場合は設定。使わないなら空のままでOK。
  const TRAQ_WEBHOOK_URL = '';
  const TRAQ_CHANNEL_ID = '';
  // ================================================================

  const RESULT_EMOJI = {
    AC: ':accepted.large:', WA: ':wrong_answer.large:', RE: ':runtime_error.large:',
    TLE: ':time_limit_exceeded.large:', MLE: ':memory_limit_exceeded.large:', CE: ':compilation_error.large:',
  };
  const FINAL = ['AC', 'WA', 'RE', 'TLE', 'MLE', 'CE', 'OLE', 'IE', 'WR'];

  const url = location.href;

  // ---- 1. 問題ページ: 提出時にフラグを保存 ----
  if (url.includes('/tasks/')) {
    const form = document.querySelector('form[action*="/submit"]') || document.querySelector('form');
    if (!form) return;
    form.addEventListener('submit', () => {
      const m = location.pathname.match(/\/tasks\/([^/]+)/);
      localStorage.setItem('vabc_submitted', 'true');
      localStorage.setItem('vabc_title', document.title);
      localStorage.setItem('vabc_url', location.href);
      if (m) localStorage.setItem('vabc_problem_id', m[1]);
      else localStorage.removeItem('vabc_problem_id');
    });
    return;
  }

  // ---- 2. 提出一覧ページ: ジャッジを監視して報告 ----
  if (url.includes('/submissions') && localStorage.getItem('vabc_submitted') === 'true') {
    console.log('[vABC] ジャッジ監視開始');
    let tries = 0;
    const timer = setInterval(() => {
      if (++tries > 120) { clearInterval(timer); console.warn('[vABC] タイムアウト'); return; }

      const row = document.querySelector('table tbody tr') || document.querySelector('tr');
      if (!row) return;
      const cell = row.querySelector('td.status span') || row.querySelector('.label') || row.querySelector('td:nth-child(7)');
      if (!cell) return;
      const result = cell.textContent.trim();
      if (!result || !FINAL.includes(result)) return; // ジャッジ中

      clearInterval(timer);
      localStorage.removeItem('vabc_submitted');

      // --- 提出情報を抽出 ---
      const problemId = localStorage.getItem('vabc_problem_id');
      const title = localStorage.getItem('vabc_title') || 'AtCoder Task';

      const link = row.querySelector('a[href*="/submissions/"]') || row.querySelector('td:last-child a');
      const href = link ? link.getAttribute('href') : '';
      const idMatch = href.match(/\/submissions\/(\d+)/);
      const submissionId = idMatch ? Number(idMatch[1]) : null;
      const submissionUrl = href ? 'https://atcoder.jp' + href : location.href;

      // 提出時刻（AtCoderのtime要素。JST想定で解釈、失敗時は現在時刻）
      const epochSecond = parseEpochSecond(row);

      // --- virtualABC サーバーへ報告 ---
      if (problemId && submissionId && VABC_TOKEN && VABC_TOKEN !== 'PASTE_YOUR_TOKEN_HERE') {
        reportToVABC({ submissionId, problemId, result, epochSecond });
      } else {
        console.warn('[vABC] トークン未設定 or 情報不足のため報告スキップ');
      }

      // --- （任意）traQ 通知 ---
      if (TRAQ_WEBHOOK_URL && TRAQ_CHANNEL_ID) {
        notifyTraq(problemId, title, RESULT_EMOJI[result] || result, submissionUrl);
      }
    }, 1000);
  }

  // 提出行から提出時刻(unix秒)を推定
  function parseEpochSecond(row) {
    const timeEl = row.querySelector('time');
    const text = timeEl ? timeEl.textContent.trim() : '';
    // 例: "2024-12-14 23:01:50" -> JSTとして解釈
    const m = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (m) {
      const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`;
      const t = Date.parse(iso);
      if (!Number.isNaN(t)) return Math.floor(t / 1000);
    }
    return Math.floor(Date.now() / 1000);
  }

  function reportToVABC(payload) {
    GM_xmlhttpRequest({
      method: 'POST',
      url: `${VABC_API}/api/submissions`,
      headers: { 'Content-Type': 'application/json', 'X-VABC-Token': VABC_TOKEN },
      data: JSON.stringify(payload),
      onload: (res) => console.log('[vABC] 報告完了', res.status, res.responseText),
      onerror: () => console.error('[vABC] 報告失敗（VABC_API / @connect を確認）'),
    });
  }

  function notifyTraq(problemId, title, resultLabel, submissionUrl) {
    const send = (diffLine) => {
      GM_xmlhttpRequest({
        method: 'POST', url: TRAQ_WEBHOOK_URL,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-TRAQ-Channel-Id': TRAQ_CHANNEL_ID },
        data: `${title} ${resultLabel}\n${diffLine}\n詳細: ${submissionUrl}`,
      });
    };
    if (!problemId) return send('Difficulty: 取得失敗');
    GM_xmlhttpRequest({
      method: 'GET', url: 'https://kenkoooo.com/atcoder/resources/problem-models.json',
      onload: (r) => {
        let diff = '取得失敗';
        try {
          const models = JSON.parse(r.responseText);
          const raw = models[problemId] && models[problemId].difficulty;
          if (raw !== undefined) {
            diff = raw >= 400 ? Math.round(raw) : Math.round(400 / Math.exp(1.0 - raw / 400.0));
            if (models[problemId].is_experimental) diff = `${diff} (experimental)`;
          }
        } catch (e) { /* noop */ }
        send(`Difficulty: ${diff}`);
      },
      onerror: () => send('Difficulty: 取得失敗'),
    });
  }
})();
