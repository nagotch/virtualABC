import { useEffect, useState } from 'react';

// ユーザースクリプトが nagotch_virtual のページで立てるマーカー属性。
const ATTR = 'data-nvr-installed';

// ユーザースクリプトがインストール済みかを返す。
// スクリプトは <html> に data-nvr-installed 属性を立てるので、その有無を監視する。
// （スクリプトの実行タイミングがReactマウント後でも拾えるようMutationObserverで追従）
export function useUserscriptInstalled(): boolean {
  const [installed, setInstalled] = useState<boolean>(
    () => document.documentElement.hasAttribute(ATTR),
  );

  useEffect(() => {
    if (document.documentElement.hasAttribute(ATTR)) { setInstalled(true); return; }
    const obs = new MutationObserver(() => {
      if (document.documentElement.hasAttribute(ATTR)) {
        setInstalled(true);
        obs.disconnect();
      }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: [ATTR] });
    return () => obs.disconnect();
  }, []);

  return installed;
}
