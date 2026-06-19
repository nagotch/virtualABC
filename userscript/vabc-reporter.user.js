// ==UserScript==
// @name         nagotch_virtual Submission Reporter
// @namespace    http://tampermonkey.net/
// @version      4.3
// @description  AtCoderの提出詳細ページで、開催中のnagotch_virtualコンテスト対象問題かつ「自分の提出」のときだけ報告ボタンを表示します。押すと提出結果を報告します（自動報告なし）。報告はあくまで予測順位用で、確定順位・確定レートはAtCoder Problemsの公式データから集計されます。
// @author       traP
// @homepageURL  https://github.com/nagotch/nagotch_virtual
// @supportURL   https://github.com/nagotch/nagotch_virtual/issues
// @downloadURL  https://nagotch-virtual.trap.show/vabc-reporter.user.js
// @updateURL    https://nagotch-virtual.trap.show/vabc-reporter.user.js
// @match        https://atcoder.jp/contests/*/submissions/*
// @match        https://nagotch-virtual.trap.show/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      nagotch-virtual.trap.show
// @connect      localhost
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '4.3';

  // nagotch_virtual 本体のページでは、インストール済みを知らせるマーカーだけ立てて終了する。
  // （アプリ側はこの属性を見て「インストールリンク」を隠す）
  if (location.hostname === 'nagotch-virtual.trap.show') {
    document.documentElement.setAttribute('data-nvr-installed', VERSION);
    return;
  }

  // ===== 設定 =====================================================
  // 既定の接続先（本番。Path Overlay でフロントとAPIが同一オリジン = APP_URL）。
  // 各ユーザーは Tampermonkey メニュー「nagotch_virtual: サーバーURLを設定」から
  // いつでも上書きできます（コード編集不要。ローカル開発なら http://localhost:3000 等）。
  const DEFAULT_API_BASE = 'https://nagotch-virtual.trap.show';
  // ================================================================

  const LOG_PREFIX = '[nagotch_virtual]';
  const FINAL_VERDICTS = ['AC', 'WA', 'RE', 'TLE', 'MLE', 'CE', 'OLE', 'IE', 'WR'];

  const log = (...a) => console.log(LOG_PREFIX, ...a);
  const warn = (...a) => console.warn(LOG_PREFIX, ...a);

  // ---- 設定（サーバーURL） ----------------------------------------
  const getApiBase = () =>
    String(GM_getValue('apiBase', DEFAULT_API_BASE) || DEFAULT_API_BASE).replace(/\/+$/, '');

  GM_registerMenuCommand('nagotch_virtual: サーバーURLを設定', () => {
    const next = prompt('nagotch_virtual のサーバーURL', getApiBase());
    if (next && next.trim()) {
      GM_setValue('apiBase', next.trim());
      alert(`${LOG_PREFIX} サーバーURLを保存しました:\n${next.trim()}`);
    }
  });

  // ---- APIクライアント --------------------------------------------
  const apiGet = (path, onData) =>
    GM_xmlhttpRequest({
      method: 'GET',
      url: getApiBase() + path,
      onload: (res) => {
        try { onData(JSON.parse(res.responseText)); }
        catch (e) { warn('レスポンス解析失敗', e); }
      },
      onerror: () => warn('接続失敗（サーバーURL / @connect を確認）'),
    });

  const apiPost = (path, payload, onOk, onErr) =>
    GM_xmlhttpRequest({
      method: 'POST',
      url: getApiBase() + path,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(payload),
      onload: (res) => {
        const ok = res.status >= 200 && res.status < 300;
        log('報告応答', res.status, res.responseText);
        (ok ? onOk : onErr)();
      },
      onerror: () => { warn('報告失敗（接続）'); onErr(); },
    });

  // ---- 提出詳細ページからの情報抽出 --------------------------------
  // 問題ID（情報テーブル内の /tasks/ リンク）
  const getProblemId = () => {
    const a = document.querySelector("table a[href*='/tasks/']") || document.querySelector("a[href*='/tasks/']");
    const m = a && a.getAttribute('href').match(/\/tasks\/([^/?#]+)/);
    return m ? m[1] : null;
  };

  // 提出者ハンドル（情報テーブル内の /users/ リンク。ナビバーは table 外なので混入しない）
  const getSubmitterHandle = () => {
    const a = document.querySelector("table a[href^='/users/']");
    const m = a && a.getAttribute('href').match(/\/users\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  };

  // ログイン中ハンドル（ナビバー右上）
  const getLoginHandle = () => {
    const a = document.querySelector('.navbar-right a[href^="/users/"]')
           || document.querySelector('.dropdown-menu a[href^="/users/"]');
    const m = a && a.getAttribute('href').match(/\/users\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  };

  // 最終ジャッジ結果（テーブル内の verdict ラベル/セル）
  const getVerdict = () => {
    for (const el of document.querySelectorAll('table .label, table td span, table td')) {
      const t = el.textContent.trim();
      if (FINAL_VERDICTS.includes(t)) return t;
    }
    return null;
  };

  // 提出時刻(unix秒)。提出詳細ページの time 要素は3つ（開始/終了/提出）あり、
  // 提出時刻は class="fixtime-second"。タイムゾーン表記があれば尊重、無ければJST想定、失敗時は現在時刻。
  const parseEpochSecond = () => {
    const el = document.querySelector('time.fixtime-second') || document.querySelector('time');
    const text = (el ? el.textContent : '').trim().replace(/\//g, '-');
    const m = text.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})\s*([+-]\d{2}:?\d{2}|Z)?/);
    if (!m) return Math.floor(Date.now() / 1000);
    let off = m[7] || '+0900';
    if (off === 'Z') off = '+0000';
    if (!off.includes(':')) off = off.slice(0, 3) + ':' + off.slice(3); // +0900 -> +09:00
    const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${off}`);
    return Number.isNaN(t) ? Math.floor(Date.now() / 1000) : Math.floor(t / 1000);
  };

  const extractSubmission = () => {
    const idMatch = location.pathname.match(/\/submissions\/(\d+)/);
    return {
      submissionId: idMatch ? Number(idMatch[1]) : null,
      problemId: getProblemId(),
      atcoderId: getSubmitterHandle(),
      result: getVerdict(),
      epochSecond: parseEpochSecond(),
    };
  };

  // 不正防止: ログイン中の本人の提出かどうか。
  // 他人の提出ページや、未ログイン状態での報告を防ぐ（最終防御はサーバー側。
  // スクリプト報告は source='script' として予測順位にのみ使われ、確定には影響しない）。
  const isOwnSubmission = (sub) => {
    const login = getLoginHandle();
    if (!login) { warn('AtCoderにログインしていません'); return false; }
    if (!sub.atcoderId) { warn('提出者を特定できません'); return false; }
    return sub.atcoderId.toLowerCase() === login.toLowerCase();
  };

  const isReportable = (sub) =>
    !!sub.atcoderId && !!sub.problemId && Number.isFinite(sub.submissionId)
    && !!sub.result && FINAL_VERDICTS.includes(sub.result)
    && Number.isFinite(sub.epochSecond);

  // ---- 報告ボタン（左下） -----------------------------------------
  const LABEL = 'nagotch_virtualに報告';
  const COLORS = { idle: '#6366f1', ok: '#16a34a', err: '#ef4444' };

  const mountButton = () => {
    const btn = document.createElement('button');
    btn.textContent = LABEL;
    Object.assign(btn.style, {
      position: 'fixed', left: '16px', bottom: '16px', zIndex: 99999,
      padding: '10px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
      background: COLORS.idle, color: '#fff', fontSize: '13px', fontWeight: '700',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    });

    const flash = (text, color) => {
      btn.textContent = text;
      btn.style.background = color;
      setTimeout(() => { btn.textContent = LABEL; btn.style.background = COLORS.idle; }, 2000);
    };

    btn.addEventListener('click', () => {
      // クリック時に再抽出・再検証（ジャッジ完了直後や他人ページ遷移にも追従）。
      const sub = extractSubmission();
      if (!isOwnSubmission(sub)) { flash('本人の提出のみ報告可', COLORS.err); return; }
      if (!isReportable(sub)) { flash('情報取得失敗', COLORS.err); warn('報告不可', sub); return; }
      flash('報告中...', COLORS.idle);
      apiPost('/api/submissions', sub,
        () => flash('報告しました ✓', COLORS.ok),
        () => flash('報告失敗', COLORS.err));
    });

    document.body.appendChild(btn);
  };

  // ---- エントリポイント -------------------------------------------
  const main = () => {
    if (!/\/submissions\/\d+/.test(location.pathname)) return;

    const sub = extractSubmission();
    if (!sub.problemId) return;
    // 本人の提出でなければボタンを出さない（不正防止）。
    if (!isOwnSubmission(sub)) { log('本人の提出ではないため報告ボタンを表示しません'); return; }

    // 開催中コンテストに含まれる問題のときだけボタンを表示。
    apiGet('/api/contests/active-problems', (data) => {
      if (Array.isArray(data.problemIds) && data.problemIds.includes(sub.problemId)) {
        mountButton();
      }
    });
  };

  main();
})();
