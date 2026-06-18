// ==UserScript==
// @name         virtualABC Submission Reporter
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  AtCoderの提出結果を virtualABC サーバーに報告し、リアルタイム順位表を実現します。ログイン中のAtCoder IDを自動取得するので設定不要です。
// @author       traP
// @match        https://atcoder.jp/contests/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function () {
  'use strict';

  // ===== 設定 =====================================================
  // virtualABC サーバーのURL（デプロイ先に合わせて変更）
  const VABC_API = 'http://localhost:3000';
  // ================================================================

  const FINAL = ['AC', 'WA', 'RE', 'TLE', 'MLE', 'CE', 'OLE', 'IE', 'WR'];

  const url = location.href;

  // ---- 1. 問題ページ: 提出時にフラグを保存 ----
  if (url.includes('/tasks/')) {
    const form = document.querySelector('form[action*="/submit"]') || document.querySelector('form');
    if (!form) return;
    form.addEventListener('submit', () => {
      const m = location.pathname.match(/\/tasks\/([^/]+)/);
      localStorage.setItem('vabc_submitted', 'true');
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
      const atcoderId = getLoginHandle();
      const problemId = localStorage.getItem('vabc_problem_id');

      const link = row.querySelector('a[href*="/submissions/"]') || row.querySelector('td:last-child a');
      const href = link ? link.getAttribute('href') : '';
      const idMatch = href.match(/\/submissions\/(\d+)/);
      const submissionId = idMatch ? Number(idMatch[1]) : null;

      // 提出時刻（AtCoderのtime要素。JST想定で解釈、失敗時は現在時刻）
      const epochSecond = parseEpochSecond(row);

      if (atcoderId && problemId && submissionId) {
        reportToVABC({ atcoderId, submissionId, problemId, result, epochSecond });
      } else {
        console.warn('[vABC] 情報不足のため報告スキップ', { atcoderId, problemId, submissionId });
      }
    }, 1000);
  }

  // ログイン中のAtCoderハンドルをページから取得
  function getLoginHandle() {
    // ナビバー右側のユーザーメニュー内、プロフィールへのリンク /users/{handle}
    const a = document.querySelector('.navbar-right a[href^="/users/"]')
           || document.querySelector('.dropdown-menu a[href^="/users/"]')
           || document.querySelector('a.username[href^="/users/"]');
    if (a) {
      const m = a.getAttribute('href').match(/\/users\/([^/?#]+)/);
      if (m) return decodeURIComponent(m[1]);
    }
    return null;
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
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(payload),
      onload: (res) => console.log('[vABC] 報告完了', res.status, res.responseText),
      onerror: () => console.error('[vABC] 報告失敗（VABC_API / @connect を確認）'),
    });
  }
})();
