// ==UserScript==
// @name         virtualABC Submission Reporter
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  AtCoderの提出結果を virtualABC サーバーに報告し、リアルタイム順位表を実現します。ログイン中のAtCoder IDを自動取得。左下に手動報告ボタンも表示します。
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
    if (form) {
      form.addEventListener('submit', () => {
        const m = location.pathname.match(/\/tasks\/([^/]+)/);
        localStorage.setItem('vabc_submitted', 'true');
        if (m) localStorage.setItem('vabc_problem_id', m[1]);
        else localStorage.removeItem('vabc_problem_id');
      });
    }
    return;
  }

  // ---- 2. 提出ページ（一覧 / 詳細）----
  if (url.includes('/submissions')) {
    // 左下に手動報告ボタンを常時表示（自動報告の不具合時用）
    addManualButton();

    // 自動報告: 直前に提出した場合のみジャッジを監視
    if (localStorage.getItem('vabc_submitted') === 'true') {
      watchAndAutoReport();
    }
  }

  // ---- 自動報告（提出直後の一覧ページ）----
  function watchAndAutoReport() {
    console.log('[vABC] ジャッジ監視開始');
    let tries = 0;
    const timer = setInterval(() => {
      if (++tries > 120) { clearInterval(timer); console.warn('[vABC] タイムアウト'); return; }
      const data = extractFromList();
      if (!data || !data.result || !FINAL.includes(data.result)) return; // ジャッジ中
      clearInterval(timer);
      localStorage.removeItem('vabc_submitted');
      if (data.atcoderId && data.problemId && data.submissionId) {
        reportToVABC(data, () => {}, () => {});
      } else {
        console.warn('[vABC] 情報不足のため自動報告スキップ', data);
      }
    }, 1000);
  }

  // ---- 手動報告ボタン ----
  function addManualButton() {
    const btn = document.createElement('button');
    btn.textContent = 'virtualABCに報告';
    Object.assign(btn.style, {
      position: 'fixed', left: '16px', bottom: '16px', zIndex: 99999,
      padding: '10px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
      background: '#6366f1', color: '#fff', fontSize: '13px', fontWeight: '700',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    });
    btn.addEventListener('click', () => {
      const isDetail = /\/submissions\/\d+/.test(location.pathname);
      const data = isDetail ? extractFromDetail() : extractFromList();
      if (!data || !data.atcoderId || !data.problemId || !data.submissionId || !data.result) {
        flash(btn, '情報取得失敗', '#ef4444');
        console.warn('[vABC] 手動報告: 情報取得失敗', data);
        return;
      }
      flash(btn, '報告中...', '#6366f1');
      reportToVABC(
        data,
        () => flash(btn, '報告しました ✓', '#16a34a'),
        () => flash(btn, '報告失敗', '#ef4444'),
      );
    });
    document.body.appendChild(btn);
  }

  function flash(btn, text, color) {
    const orig = 'virtualABCに報告';
    btn.textContent = text;
    btn.style.background = color;
    setTimeout(() => { btn.textContent = orig; btn.style.background = '#6366f1'; }, 2000);
  }

  // ---- 提出情報の抽出 ----
  // 提出一覧ページの先頭行から
  function extractFromList() {
    const row = document.querySelector('table tbody tr') || document.querySelector('tr');
    if (!row) return null;
    const cell = row.querySelector('td.status span') || row.querySelector('.label') || row.querySelector('td:nth-child(7)');
    const result = cell ? cell.textContent.trim() : null;
    const link = row.querySelector('a[href*="/submissions/"]') || row.querySelector('td:last-child a');
    const href = link ? link.getAttribute('href') : '';
    const idMatch = href.match(/\/submissions\/(\d+)/);
    const submissionId = idMatch ? Number(idMatch[1]) : null;
    return {
      atcoderId: getLoginHandle(),
      problemId: localStorage.getItem('vabc_problem_id') || problemIdFromRow(row),
      submissionId,
      result,
      epochSecond: parseEpochSecond(row),
    };
  }

  // 提出詳細ページから
  function extractFromDetail() {
    const idMatch = location.pathname.match(/\/submissions\/(\d+)/);
    const submissionId = idMatch ? Number(idMatch[1]) : null;

    const taskLink = document.querySelector("table a[href*='/tasks/']") || document.querySelector("a[href*='/tasks/']");
    const pm = taskLink ? taskLink.getAttribute('href').match(/\/tasks\/([^/?#]+)/) : null;
    const problemId = pm ? pm[1] : null;

    // 提出者（情報テーブル内の /users/ リンク。ナビバーは除外）
    const userLink = document.querySelector("table a[href^='/users/']");
    const um = userLink ? userLink.getAttribute('href').match(/\/users\/([^/?#]+)/) : null;
    const atcoderId = um ? decodeURIComponent(um[1]) : getLoginHandle();

    // 結果（テーブル内の verdict ラベル/セル）
    let result = null;
    for (const el of document.querySelectorAll('table .label, table td span, table td')) {
      const t = el.textContent.trim();
      if (FINAL.includes(t)) { result = t; break; }
    }

    return { atcoderId, problemId, submissionId, result, epochSecond: parseEpochSecond(document) };
  }

  // 行から problemId を推定（task リンクがあれば）
  function problemIdFromRow(row) {
    const a = row.querySelector("a[href*='/tasks/']");
    const m = a ? a.getAttribute('href').match(/\/tasks\/([^/?#]+)/) : null;
    return m ? m[1] : null;
  }

  // ログイン中のAtCoderハンドルをページから取得
  function getLoginHandle() {
    const a = document.querySelector('.navbar-right a[href^="/users/"]')
           || document.querySelector('.dropdown-menu a[href^="/users/"]')
           || document.querySelector('a.username[href^="/users/"]');
    if (a) {
      const m = a.getAttribute('href').match(/\/users\/([^/?#]+)/);
      if (m) return decodeURIComponent(m[1]);
    }
    return null;
  }

  // time要素から提出時刻(unix秒)を推定（JST想定、失敗時は現在時刻）
  function parseEpochSecond(scope) {
    const timeEl = scope.querySelector('time');
    const text = timeEl ? timeEl.textContent.trim() : '';
    const m = text.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (m) {
      const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`;
      const t = Date.parse(iso);
      if (!Number.isNaN(t)) return Math.floor(t / 1000);
    }
    return Math.floor(Date.now() / 1000);
  }

  function reportToVABC(payload, onOk, onErr) {
    GM_xmlhttpRequest({
      method: 'POST',
      url: `${VABC_API}/api/submissions`,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        atcoderId: payload.atcoderId,
        submissionId: payload.submissionId,
        problemId: payload.problemId,
        result: payload.result,
        epochSecond: payload.epochSecond,
      }),
      onload: (res) => {
        console.log('[vABC] 報告完了', res.status, res.responseText);
        if (res.status >= 200 && res.status < 300) onOk && onOk();
        else onErr && onErr();
      },
      onerror: () => { console.error('[vABC] 報告失敗（VABC_API / @connect を確認）'); onErr && onErr(); },
    });
  }
})();
