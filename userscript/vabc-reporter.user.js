// ==UserScript==
// @name         virtualABC Submission Reporter
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  AtCoderの提出詳細ページで、その問題が開催中のvirtualABCコンテストに含まれる場合のみ「報告」ボタンを表示します。ボタンを押すと提出結果を報告します（自動報告なし）。
// @author       traP
// @match        https://atcoder.jp/contests/*/submissions/*
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

  // 提出詳細ページ（/contests/.../submissions/{数字}）のみ対象
  if (!/\/submissions\/\d+/.test(location.pathname)) return;

  const problemId = getProblemId();
  if (!problemId) return;

  // 開催中コンテストに含まれる問題のときだけボタンを出す
  GM_xmlhttpRequest({
    method: 'GET',
    url: `${VABC_API}/api/contests/active-problems`,
    onload: (res) => {
      try {
        const { problemIds } = JSON.parse(res.responseText);
        if (Array.isArray(problemIds) && problemIds.includes(problemId)) {
          addManualButton();
        }
      } catch (e) {
        console.error('[vABC] active-problems 取得失敗', e);
      }
    },
    onerror: () => console.error('[vABC] active-problems 接続失敗（VABC_API / @connect を確認）'),
  });

  // ---- 手動報告ボタン（左下） ----
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
      const data = extractFromDetail();
      if (!data.atcoderId || !data.problemId || !data.submissionId || !data.result || !FINAL.includes(data.result)) {
        flash(btn, '情報取得失敗', '#ef4444');
        console.warn('[vABC] 報告: 情報取得失敗', data);
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
    btn.textContent = text;
    btn.style.background = color;
    setTimeout(() => { btn.textContent = 'virtualABCに報告'; btn.style.background = '#6366f1'; }, 2000);
  }

  // ---- 提出詳細ページから情報抽出 ----
  function getProblemId() {
    const a = document.querySelector("table a[href*='/tasks/']") || document.querySelector("a[href*='/tasks/']");
    const m = a ? a.getAttribute('href').match(/\/tasks\/([^/?#]+)/) : null;
    return m ? m[1] : null;
  }

  function extractFromDetail() {
    const idMatch = location.pathname.match(/\/submissions\/(\d+)/);
    const submissionId = idMatch ? Number(idMatch[1]) : null;

    const problemId = getProblemId();

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

  function getLoginHandle() {
    const a = document.querySelector('.navbar-right a[href^="/users/"]')
           || document.querySelector('.dropdown-menu a[href^="/users/"]');
    if (a) {
      const m = a.getAttribute('href').match(/\/users\/([^/?#]+)/);
      if (m) return decodeURIComponent(m[1]);
    }
    return null;
  }

  // 提出時刻(unix秒)を取得。
  // 提出詳細ページの time 要素は3つ（コンテスト開始/終了/提出）あり、
  // 提出時刻は class="fixtime-second"。これを狙って取得する。
  // タイムゾーン表記(+0900 等)があればそれを尊重し、無ければJST想定。失敗時は現在時刻。
  function parseEpochSecond(scope) {
    const el = scope.querySelector('time.fixtime-second') || scope.querySelector('time');
    const text = (el ? el.textContent : '').trim().replace(/\//g, '-');
    const m = text.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\s*([+-]\d{2}:?\d{2}|Z)?/);
    if (!m) return Math.floor(Date.now() / 1000);
    let off = m[7] || '+0900';
    if (off === 'Z') off = '+0000';
    if (!off.includes(':')) off = off.slice(0, 3) + ':' + off.slice(3); // +0900 -> +09:00
    const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${off}`);
    return Number.isNaN(t) ? Math.floor(Date.now() / 1000) : Math.floor(t / 1000);
  }

  function reportToVABC(payload, onOk, onErr) {
    GM_xmlhttpRequest({
      method: 'POST',
      url: `${VABC_API}/api/submissions`,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(payload),
      onload: (res) => {
        console.log('[vABC] 報告完了', res.status, res.responseText);
        if (res.status >= 200 && res.status < 300) onOk && onOk();
        else onErr && onErr();
      },
      onerror: () => { console.error('[vABC] 報告失敗'); onErr && onErr(); },
    });
  }
})();
