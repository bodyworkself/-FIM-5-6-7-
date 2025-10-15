// app/evidence-cards/page.tsx の先頭付近に追記
export const dynamic = 'force-dynamic';
export const revalidate = 0;


'use client';
import React, { useMemo, useState } from 'react';

/**
 * Stroke FIM Cheatsheet – 教育・参考用 版
 * - 入力: FIM-motor 合計（0–91）, Δ（候補判定の安全余裕）
 * - 出力: Uchida 2020 の「監視=5 到達50%ポイント」に対する上回り幅と候補判定
 * - 注意: 教育・参考用。診療上の意思決定を代替しません。
 */

/* ---------- tiny UI primitives ---------- */
const cn = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div className={cn('rounded border shadow-sm bg-white', className)}>{children}</div>
);
const CardContent: React.FC<{ className?: string; children: React.ReactNode }> = ({ className, children }) => (
  <div className={cn('p-4', className)}>{children}</div>
);
const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className, children, type = 'button', ...rest }) => (
  <button type={type} {...rest} className={cn('inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm hover:bg-gray-50 active:bg-gray-100', className)}>{children}</button>
);
const Alert: React.FC<{ type?: 'info' | 'warning' | 'error'; className?: string; children: React.ReactNode }> = ({ type = 'info', className, children }) => {
  const base = 'p-2 rounded text-sm border';
  const color = type === 'error' ? 'bg-red-50 text-red-800 border-red-200' : type === 'warning' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-blue-50 text-blue-800 border-blue-200';
  return <div role="alert" className={cn(base, color, className)}>{children}</div>;
};

/* ---------- shared text constants ---------- */
const TEXT = {
  PURPOSE_JA: '教育・参考用',
  PURPOSE_NOTE_JA: '臨床判断の根拠にはしません',
  PURPOSE_FULL_JA: '教育・参考用（臨床判断の根拠にはしません）',
  PURPOSE_FULL_EN: 'For education only (not for clinical decisions)'
} as const;
const WATERMARK = `${TEXT.PURPOSE_FULL_JA} / ${TEXT.PURPOSE_FULL_EN}`;

const InfoBanner: React.FC<{ onOpenAbout: () => void }> = ({ onOpenAbout }) => (
  <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b p-2">
    <div className="flex items-center justify-between gap-2 text-xs">
      <div className="text-amber-800 font-medium">
        {TEXT.PURPOSE_FULL_JA}｜本ツールは教育目的の参考情報です。<b>医療判断を代替しません</b>。施設データでの較正前提でご利用ください。
      </div>
      <Button onClick={onOpenAbout} className="px-2 py-1">注意</Button>
    </div>
  </div>
);

/* ---------- viewport helper (iOS vh対策) ---------- */
const useViewportVH = () => {
  React.useEffect(() => {
    const setVh = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    setVh();
    window.addEventListener('resize', setVh);
    return () => window.removeEventListener('resize', setVh);
  }, []);
};

/* ---------- accessible Modal (Esc close + focus trap) ---------- */
const Modal: React.FC<{
  onClose: () => void; title: string; children: React.ReactNode;
  disableEsc?: boolean; disableBackdropClose?: boolean
}> = ({ onClose, title, children, disableEsc = false, disableBackdropClose = false }) => {
  const contentRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disableEsc) { e.preventDefault(); onClose(); }
      if (e.key === 'Tab') {
        const list = contentRef.current?.querySelectorAll<HTMLElement>('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!list || list.length === 0) return;
        const first = list[0], last = list[list.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const first = contentRef.current?.querySelector<HTMLElement>('a,button,input,[tabindex]:not([tabindex="-1"])');
    first?.focus();
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose, disableEsc]);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      style={{ height: 'calc(var(--vh, 1vh) * 100)' }}
      onClick={disableBackdropClose ? undefined : onClose}
      role="dialog" aria-modal="true" aria-label={title}
    >
      <div ref={contentRef} className="bg-white rounded-lg p-4 md:p-6 max-w-lg w-full shadow-lg" onClick={(e)=>e.stopPropagation()}>
        <div className="flex justify-between items-start gap-4 border-b pb-2 mb-3">
          <h3 className="text-base md:text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="閉じる">×</button>
        </div>
        {children}
      </div>
    </div>
  );
};

/* ---------- evidence constants ---------- */
const THRESHOLDS = [
  { key: 'eating',           jp: '食事',                 en: 'Eating',                    th: 34.1, note: '早期から 6–7 へ移行しやすい。嚥下・巧緻を個別評価。' },
  { key: 'bowel',            jp: '排便管理',             en: 'Bowel Management',          th: 42.2, note: 'ルーチン化・環境調整の寄与が大。' },
  { key: 'bladder',          jp: '排尿管理',             en: 'Bladder Management',        th: 43.4, note: 'デバイス選択とタイミングの最適化。' },
  { key: 'groom',            jp: '整容',                 en: 'Grooming',                  th: 51.0, note: '片手操作・立位保持の工夫で 6–7 を狙う。' },
  { key: 'toilet',           jp: 'トイレ動作（用便）',    en: 'Toileting',                 th: 62.0, note: '手順化・姿勢制御・衣類操作の分割練習。' },
  { key: 'dressL',           jp: '更衣（下半身）',        en: 'Dressing – Lower Body',     th: 64.5, note: '片麻痺側のテコ入れ・座位安定化。' },
  { key: 'bedChairTransfer', jp: '移乗（ベッド/椅子/車いす）', en: 'Transfer to Bed/Chair/WC', th: 65.5, note: '立ち上がり・体幹/股関節戦略の自動化。' },
  { key: 'toiletTransfer',   jp: 'トイレ移乗',           en: 'Transfer to Toilet',        th: 65.9, note: '狭所レイアウト適応・手すり配置。' },
  { key: 'bathing',          jp: '入浴（洗体）',          en: 'Bathing',                   th: 70.3, note: '省略可否の判断と安全補助具の選定。' },
  { key: 'dressU',           jp: '更衣（上半身）',        en: 'Dressing – Upper Body',     th: 73.6, note: '片手更衣の手順最適化。' },
  { key: 'walk',             jp: '移動（歩行/車いす）',    en: 'Locomotion',                th: 74.2, note: '距離・速度よりも安全・安定を先行。' },
  { key: 'tubTransfer',      jp: '浴槽/シャワー移乗',      en: 'Transfer to Tub/Shower',    th: 80.0, note: '最難領域。段差・濡れ環境への戦略化が鍵。' },
  { key: 'stairs',           jp: '階段',                  en: 'Stairs',                    th: 89.2, note: '最難。監視→自立には十分な余力が必要。' },
] as const;

/* ---------- helpers ---------- */
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const F = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const isValidNumberStr = (s: string, min: number, max: number) => s !== '' && Number.isFinite(Number(s)) && Number(s) >= min && Number(s) <= max;

/* 計算ロジック（純関数） */
const computeRows = (fim: number, buffer: number, sortKey: 'order' | 'margin' | 'th') => {
  const rows = THRESHOLDS.map((r, i) => {
    const margin = fim - r.th;            // + で「上回り」
    const candidate = margin >= buffer;   // 上回り幅 ≥ Δ
    return { ...r, margin, candidate, idx: i };
  });
  const sorters = {
    order:  (a: any, b: any) => a.idx - b.idx,
    margin: (a: any, b: any) => b.margin - a.margin,
    th:     (a: any, b: any) => a.th - b.th,
  } as const;
  return rows.sort(sorters[sortKey]);
};

export default function EvidenceCardsPage() {
  useViewportVH();

  React.useEffect(() => {
    try { document.body.setAttribute('data-wm', WATERMARK); } catch {}
    return () => { try { document.body.removeAttribute('data-wm'); } catch {} };
  }, []);

  // 入力は string を保持（空文字許容）→ 妥当性は別管理
  const [fimStr, setFimStr] = useState('60');
  const [bufStr, setBufStr] = useState('5');
  const fim = Number(fimStr);
  const buffer = Number(bufStr);
  const fimValid = isValidNumberStr(fimStr, 0, 91);
  const bufValid = isValidNumberStr(bufStr, 0, 20);

  const [sortKey, setSortKey] = useState<'order' | 'margin' | 'th'>('order');
  const showRows = fimValid && bufValid;
  const rows = useMemo(() => (showRows ? computeRows(fim, buffer, sortKey) : []), [showRows, fim, buffer, sortKey]);
  const candidateCount = showRows ? rows.filter((r) => r.candidate).length : 0;

  const [showDeltaTip, setShowDeltaTip] = useState(false);
  const [tests, setTests] = useState<{ name: string; pass: boolean; detail: string }[]>([]);

  // 注意/同意/規約/プライバシー
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isConsentOpen, setIsConsentOpen] = useState(() => (typeof window !== 'undefined' && !localStorage.getItem('consented_v1')));
  const [agree, setAgree] = useState({ a: false, b: false, c: false });
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const acceptConsent = () => { localStorage.setItem('consented_v1', '1'); setIsConsentOpen(false); };

  const runTests = () => {
    const out: { name: string; pass: boolean; detail: string }[] = [];
    out.push({ name: 'clamp', pass: clamp(-5, 0, 91) === 0 && clamp(100, 0, 91) === 91, detail: `[-5→${clamp(-5, 0, 91)}, 100→${clamp(100, 0, 91)}]` });
    const msort = computeRows(60, 5, 'margin');
    out.push({ name: '並べ替え（上回り幅）', pass: msort.every((r, i, a) => i === 0 || a[i - 1].margin >= r.margin), detail: `top=${F(msort[0]?.margin ?? NaN, 1)}` });
    const tsort = computeRows(60, 5, 'th');
    out.push({ name: '並べ替え（しきい値）', pass: tsort.every((r, i, a) => i === 0 || a[i - 1].th <= r.th), detail: `min=${F(tsort[0]?.th ?? NaN, 1)}` });
    const probe = computeRows(60, 5, 'order');
    out.push({ name: '候補（margin ≥ Δ）', pass: probe.every((r) => (60 - r.th >= 5) === r.candidate), detail: `rows=${probe.length}` });
    const c1 = computeRows(60, 5, 'order').filter((r) => r.candidate).length;
    const c2 = computeRows(70, 5, 'order').filter((r) => r.candidate).length;
    out.push({ name: '単調性（FIM↑で候補数↑）', pass: c2 >= c1, detail: `60→${c1}, 70→${c2}` });
    out.push({ name: '入力検証: 空文字は無効(FIM/Δ)', pass: !isValidNumberStr('', 0, 91) && !isValidNumberStr('', 0, 20), detail: '"" invalid' });
    out.push({ name: '入力検証: 範囲外は無効', pass: !isValidNumberStr('-1', 0, 91) && !isValidNumberStr('92', 0, 91) && !isValidNumberStr('-1', 0, 20) && !isValidNumberStr('21', 0, 20), detail: '-1/92/21 invalid' });
    out.push({ name: '入力検証: 既定Δ=5は有効', pass: isValidNumberStr('5', 0, 20), detail: 'Δ=5 ok' });
    const thToilet = THRESHOLDS.find((x) => x.key === 'toilet')!; // 62.0
    const edge = computeRows(thToilet.th + 5, 5, 'order').find((x) => x.key === 'toilet');
    out.push({ name: '境界: 上回り幅=Δで候補 true', pass: !!edge && !!edge.candidate, detail: `margin=${F((thToilet.th + 5) - thToilet.th, 1)}, Δ=5` });
    const c0 = computeRows(60, 0, 'order').filter((r) => r.candidate).length;
    out.push({ name: 'Δ=0 なら候補数は最大', pass: c0 >= c1, detail: `Δ0=${c0} vs Δ5=${c1}` });
    const noneNaN = computeRows(60, 5, 'order').every((r) => Number.isFinite(r.margin));
    out.push({ name: 'NaNなし（margin）', pass: noneNaN, detail: 'ok' });
    out.push({ name: '行数=閾値数', pass: computeRows(60, 5, 'order').length === THRESHOLDS.length, detail: `${THRESHOLDS.length}` });
    out.push({ name: 'WATERMARK 文言', pass: typeof WATERMARK === 'string' && /教育・参考用/.test(WATERMARK), detail: WATERMARK.slice(0, 20) + '…' });
    const cHuge = computeRows(91, 999, 'order').filter(r => r.candidate).length;
    out.push({ name: 'Δ極大で候補ゼロ', pass: cHuge === 0, detail: `cHuge=${cHuge}` });
    setTests(out);
  };

  return (
    <div className="p-4 space-y-4">
      <InfoBanner onOpenAbout={() => setIsAboutOpen(true)} />

      <header className="space-y-1">
        <h1 className="text-lg font-bold">脳卒中版：FIM「監視(5)→自立(6–7)」臨床早見表</h1>
        <p className="text-xs text-gray-600">
          対象：脳卒中（急性期中心）。Uchida 2020 の「監視=5」到達50%ポイント。Koyama 2006 の曲線は 5 と 6–7 の確率帯が入れ替わる“目安”の読み取りに活用。
        </p>
      </header>

      <Card>
        <CardContent className="space-y-3">
          <div className="font-semibold">使い方（簡易フロー）</div>
          <ol className="list-decimal ml-5 text-sm space-y-1">
            <li>患者の <b>FIM-motor 合計</b> を算出（13項目合計｜最大91）。</li>
            <li>下表で <b>各項目の「監視=5に到達する50%ポイント」</b> と比較。</li>
            <li>ポイントを<b>十分に上回る</b>項目は <b>5→6–7 への移行候補</b>。</li>
          </ol>
          <Alert type="warning" className="text-xs">
            注意：母集団・病期で閾値は変動します。院内データでの再較正を推奨。
          </Alert>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 左：入力 */}
        <Card>
          <CardContent className="space-y-3">
            <div className="font-semibold">入力</div>

            <label className="flex flex-col gap-1 text-sm">
              <span>FIM-motor 合計（0–91）</span>
              <input
                type="number"
                inputMode="decimal"
                value={fimStr}
                onChange={(e) => setFimStr(e.target.value)}
                className={cn('border rounded px-2 py-1', !fimValid && 'border-red-500')}
                placeholder="例: 60"
                aria-invalid={!fimValid}
              />
              {!fimValid && <div className="text-xs text-red-700">0–91 の数値を入力してください（空欄不可）。</div>}
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <div className="flex items-center justify-between">
                <span>候補判定の安全余裕（Δ・点）</span>
                <button
                  type="button"
                  onClick={() => setShowDeltaTip((s) => !s)}
                  aria-label="Δの説明"
                  className="w-5 h-5 rounded-full border text-xs text-gray-600 hover:bg-gray-100"
                >?</button>
              </div>
              <input
                type="number"
                inputMode="decimal"
                value={bufStr}
                onChange={(e) => setBufStr(e.target.value)}
                className={cn('border rounded px-2 py-1', !bufValid && 'border-red-500')}
                placeholder="推奨: 5"
                aria-invalid={!bufValid}
              />
              <span className="text-xs text-gray-500">例：Δ=5 なら、しきい値+5点以上で候補とみなす。</span>

              {showDeltaTip && (
                <div className="mt-2 text-xs bg-slate-50 border border-slate-200 rounded p-2">
                  <div className="font-medium">Δ（安全余裕）の考え方</div>
                  <div className="mt-1"><b>上回り幅</b>＝患者のFIM-m合計 − 項目の「監視=5」の50%ポイント</div>
                  <div>候補判定の条件：<b>上回り幅 ≥ Δ</b></div>
                  <ul className="list-disc ml-5 mt-1 space-y-1">
                    <li>トイレ動作 62.0／患者 66 → 上回り幅 +4：Δ=5→非候補、Δ=3→候補</li>
                    <li>移動（歩/車）74.2／患者 75.0 → 上回り幅 +0.8：Δ=0→候補、Δ=1→非候補</li>
                    <li>浴槽/シャワー移乗 80.0／患者 82 → 上回り幅 +2：Δ=0–1→候補、Δ=3–5→非候補</li>
                  </ul>
                </div>
              )}
            </label>

            <div className="text-sm">
              <div className="font-semibold mb-1">並べ替え</div>
              <div className="flex gap-2">
                <Button onClick={() => setSortKey('order')} className={sortKey === 'order' ? 'bg-black text-white' : ''}>表の順</Button>
                <Button onClick={() => setSortKey('margin')} className={sortKey === 'margin' ? 'bg-black text-white' : ''}>上回り幅</Button>
                <Button onClick={() => setSortKey('th')} className={sortKey === 'th' ? 'bg-black text-white' : ''}>しきい値（昇順）</Button>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={() => window.print()}>印刷</Button>
              <Button onClick={() => { setFimStr('60'); setBufStr('5'); setSortKey('order'); }}>リセット</Button>
              <Button onClick={runTests}>自己テスト</Button>
            </div>

            {tests.length > 0 && (
              <div className="mt-2 border rounded p-2 text-xs">
                <div className="font-medium mb-1">自己テスト結果</div>
                <table className="w-full border-collapse">
                  <thead><tr><th className="text-left border-b py-1">テスト</th><th className="text-left border-b py-1">結果</th><th className="text-left border-b py-1">詳細</th></tr></thead>
                  <tbody>
                    {tests.map((t, i) => (
                      <tr key={i}>
                        <td className="py-1 border-b">{t.name}</td>
                        <td className={cn('py-1 border-b', t.pass ? 'text-emerald-700' : 'text-rose-700')}>{t.pass ? 'PASS' : 'FAIL'}</td>
                        <td className="py-1 border-b">{t.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 右：結果テーブル */}
        <Card className="md:col-span-2">
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-sm text-gray-500">現在の FIM-m 合計</div>
                <div className="text-2xl font-bold">
                  {fimValid ? F(fim, 0) : '—'}<span className="text-base font-normal text-gray-500"> / 91</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">5→6–7 移行候補（Δ≥{bufValid ? bufStr : '—'}）</div>
                <div className="text-2xl font-bold">{showRows ? `${candidateCount} / ${THRESHOLDS.length}` : '—'}</div>
              </div>
            </div>

            {!showRows && (
              <Alert type="error" className="text-xs" aria-live="polite">入力に誤りがあります（FIM 0–91、Δ 0–20、空欄不可）。修正すると表が表示されます。</Alert>
            )}

            <div className="overflow-auto text-sm">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-1">#</th>
                    <th className="py-1">FIM運動項目</th>
                    <th className="py-1">英語</th>
                    <th className="py-1 text-right">50%ポイント</th>
                    <th className="py-1 text-right">上回り幅</th>
                    <th className="py-1 text-center">候補</th>
                    <th className="py-1">備考</th>
                  </tr>
                </thead>
                <tbody>
                  {showRows ? (
                    rows.map((r, i) => (
                      <tr key={r.key} className={cn('border-b', r.candidate ? 'bg-green-100/60' : '')}>
                        <td className="py-1 align-top">{i + 1}</td>
                        <td className="py-1 align-top">{r.jp}</td>
                        <td className="py-1 align-top text-gray-600">{r.en}</td>
                        <td className="py-1 align-top text-right">{F(r.th, 1)}</td>
                        <td className={cn('py-1 align-top text-right', r.margin >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{F(r.margin, 1)}</td>
                        <td className="py-1 align-top text-center font-bold text-lg" title={`上回り幅 ${F(r.margin, 1)} / Δ ${bufStr}`}>{r.candidate ? '✅' : '—'}</td>
                        <td className="py-1 align-top text-slate-700 text-xs">{r.note}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td className="py-3 text-center text-gray-500" colSpan={7}>有効な入力が必要です</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-gray-600">
              <div className="font-semibold mb-1">補足：6–7（修正自立/自立）へ上げるための実務ガイド</div>
              <ol className="list-decimal ml-5 space-y-1">
                <li><b>主因を1つに絞る</b>：準備・姿勢バランス・到達可動域・手順注意・安全判断のどれか。</li>
                <li><b>まず環境を固定</b>（5分で可）：手すり位置、滑り止め、長柄具、衣類の置き方と高さ、呼び出しベルの位置。</li>
                <li><b>“できた”の基準を簡潔に</b>：<b>口頭指示なし</b>、<b>安全</b>、<b>連続して実施</b>の3点で判定。</li>
                <li><b>Δ（安全余裕）の使い方</b>：
                  <span className="block ml-4">上回り幅 ≥ Δ+5：自立練習に進む</span>
                  <span className="block ml-4">Δ ≤ 上回り幅 &lt; Δ+5：監視下で練習＋環境固定</span>
                  <span className="block ml-4">上回り幅 &lt; Δ：準備強化や分割練習を優先</span>
                </li>
                <li><b>確率のイメージ</b>（Koyama 2006）：<b>上回り幅</b>が増えるほど、6–7の確率が5を上回る“自立優勢域”に入る。</li>
              </ol>

              <hr className="my-2" />
              <div className="font-semibold">項目別 “できた” 基準（現場の目安・例）</div>
              <details className="mt-1">
                <summary className="cursor-pointer font-medium text-slate-700">トイレ動作（Toileting）</summary>
                <ul className="list-disc ml-6 mt-1 space-y-1">
                  <li><b>FIM 5（監視／セットアップ）</b>：安全見守りや口頭指示が必要。用具の準備に援助が要る。</li>
                  <li><b>FIM 6（修正自立）</b>：<b>口頭指示なし</b>で、用具準備→使用→後始末→手洗いまで自力。補助具や時間延長は可。</li>
                  <li><b>FIM 7（完全自立）</b>：補助具なし。通常の速さで安定して完了。</li>
                </ul>
              </details>
              <details className="mt-1">
                <summary className="cursor-pointer font-medium text-slate-700">更衣（下半身）</summary>
                <ul className="list-disc ml-6 mt-1 space-y-1">
                  <li><b>FIM 5</b>：衣類準備や手順の口頭指示が要る。</li>
                  <li><b>FIM 6</b>：<u>口頭指示なし</u>。座位で患側→健側の順に穿着／必要なら長柄具可／10分以内。</li>
                  <li><b>FIM 7</b>：補助具なし・立位への移行含めてスムーズに完了。</li>
                </ul>
              </details>
              <details className="mt-1">
                <summary className="cursor-pointer font-medium text-slate-700">移乗（ベッド/椅子/車いす）</summary>
                <ul className="list-disc ml-6 mt-1 space-y-1">
                  <li><b>FIM 5</b>：安全確認や手順の口頭指示が要る／一部介助に近い場面が残る。</li>
                  <li><b>FIM 6</b>：<u>口頭指示なし</u>。ブレーキ→フットレスト→立ち上がり→回転→着座の<b>5手順を連続</b>。スライディングボード等の補助具は可。</li>
                  <li><b>FIM 7</b>：補助具なし・通常速度・安定。</li>
                </ul>
              </details>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="text-xs text-slate-700 space-y-1">
          <div className="font-semibold">運用上の注意</div>
          <div>・本表は急性期・虚血性脳卒中の解析に基づく「監視=5」到達指標。回復期や出血性などでは施設ごとに再推定を推奨。</div>
          <div>・認知/注意/失語/失行/無視などの高次脳機能は、同じFIM-mでも自立化確率を変動させるため個別評価を併記。</div>
          <div className="text-gray-500 mt-2">参考：Uchida 2020（Progress in Rehabilitation Medicine, Open Access）／Koyama 2006（J Rehabil Med）</div>
        </CardContent>
      </Card>

      {/* footer buttons */}
      <div className="flex items-center justify-end gap-3 text-xs pt-2 relative z-10">
        <Button onClick={() => setIsTermsOpen(true)}>利用規約</Button>
        <Button onClick={() => setIsPrivacyOpen(true)}>プライバシー</Button>
      </div>

      {/* Floating version footer */}
      <div className="fixed bottom-2 right-2 text-[11px] text-slate-500 bg-white/80 border rounded px-2 py-1 shadow-sm app-version">
        <div>v0.9.0-personal</div>
        <div className="text-[10px] leading-tight mt-0.5">
          FIM® is a trademark of Uniform Data System for Medical Rehabilitation (UDSMR). Not affiliated with or endorsed by UDSMR.
        </div>
      </div>

      {/* About / 注意 モーダル */}
      {isAboutOpen && (
        <Modal onClose={() => setIsAboutOpen(false)} title="このアプリについて（注意）">
          <div className="text-sm space-y-3">
            <div className="border rounded p-2">
              <div className="font-semibold">用途</div>
              <div className="text-xs text-slate-700">本アプリは <b>教育・参考用</b> のシミュレーターです（<b>臨床判断の根拠にはしません</b>）。<b>診療上の意思決定</b>を代替しません。</div>
            </div>
            <div className="border rounded p-2">
              <div className="font-semibold">禁止</div>
              <div className="text-xs text-slate-700">個別患者の <b>診断・治療方針・予後説明・同意取得</b> の根拠としては使用しません。<b>緊急時の判断</b>にも使用しません。</div>
            </div>
            <div className="border rounded p-2">
              <div className="font-semibold">限界</div>
              <div className="text-xs text-slate-700">出力は <b>近似モデル</b>に基づく推定で、<b>外部妥当化・校正は未実施</b>です。施設・母集団・時期により妥当性が変動します。結果は参考情報に留めてください。</div>
            </div>
            <div className="border rounded p-2">
              <div className="font-semibold">モデルについて</div>
              <div className="text-xs text-slate-700">本アプリは<b>特定論文モデルの実装ではなく</b>、教育目的の参考用です。しきい値や係数には<b>独自設定</b>を含み、<b>外部妥当化・校正は未実施</b>です。</div>
            </div>
            <div className="border rounded p-2">
              <div className="font-semibold">データ</div>
              <div className="text-xs text-slate-700">患者を特定できる情報は <b>保存・送信しません</b>（端末内で処理）。</div>
            </div>
            <div className="border rounded p-2">
              <div className="font-semibold">免責</div>
              <div className="text-xs text-slate-700">利用は <b>利用者の責任</b>で行い、提供者は結果の利用による <b>一切の損害に責任を負いません</b>。本アプリは <b>医療機器ではありません</b>。</div>
            </div>
            <div className="border rounded p-2">
              <div className="font-semibold">商標</div>
              <div className="text-xs text-slate-700">FIM® は Uniform Data System for Medical Rehabilitation (UDSMR) の登録商標です。本アプリは UDSMR と提携・承認関係にありません。</div>
            </div>
            <div className="border rounded p-2">
              <div className="font-semibold">更新履歴（Changelog）</div>
              <ul className="list-disc ml-5 text-xs text-slate-700 space-y-1">
                <li><b>v0.9.0-personal</b>（2025-10-01）: 常時ウォーターマーク、利用規約/プライバシー追加、Esc閉じ＆フォーカストラップ、商標注記、iOS vhポリフィル。</li>
              </ul>
            </div>
            <div className="text-[11px] text-slate-500">バージョン: 個人利用版 / 免責: 無保証</div>
          </div>
        </Modal>
      )}

      {/* Terms / 利用規約 */}
      {isTermsOpen && (
        <Modal onClose={() => setIsTermsOpen(false)} title="利用規約">
          <div className="text-sm space-y-2">
            <p><b>教育・参考用</b>として提供され、医療機器ではありません。</p>
            <p><b>禁止：</b>個別患者の診断・治療方針・予後説明・同意取得の根拠としての使用、緊急時判断。</p>
            <p><b>無保証：</b>本アプリは現状有姿で提供され、明示黙示を問わずいかなる保証も行いません。</p>
            <p><b>責任制限：</b>利用に起因する一切の損害について、提供者は責任を負いません。</p>
            <p><b>モデルの限界：</b>特定論文モデルの完全実装ではなく、係数は独自設定。<b>外部妥当化・校正は未実施</b>です。</p>
          </div>
        </Modal>
      )}

      {/* Privacy / プライバシー */}
      {isPrivacyOpen && (
        <Modal onClose={() => setIsPrivacyOpen(false)} title="プライバシー">
          <div className="text-sm space-y-2">
            <p><b>送信なし：</b>患者を特定できる情報を外部に送信・保存しません（端末内処理）。</p>
            <p><b>localStorage：</b>初回同意フラグ（consented_v1）のみ保存します。その他の個人データは保存しません。</p>
            <p><b>入力の扱い：</b>レポート出力時は氏名・ID 等のPIIを含めない運用を推奨します。</p>
            <p><b>ログ：</b>アクセス解析やトラッキングは実装していません。</p>
          </div>
        </Modal>
      )}

      {/* Consent（初回同意） */}
      {isConsentOpen && (
        <Modal onClose={() => {}} title="ご利用前の確認" disableEsc disableBackdropClose>
          <div className="text-sm space-y-3">
            <p className="text-slate-700">
              本アプリは <b>教育・参考用</b> のシミュレーター（<b>臨床判断の根拠にはしません</b>）です。
              <b>個別患者の診断・治療方針の決定</b>には使用しません。
            </p>
            <p className="text-slate-700">患者を特定できる情報は <b>保存・送信しません</b>。</p>

            <div className="border rounded p-2 space-y-2 text-xs">
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={agree.a} onChange={(e) => setAgree((s) => ({ ...s, a: e.target.checked }))} />
                <span>本アプリが<b>教育・参考用</b>であり、診療判断を代替しないことを理解しました。</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={agree.b} onChange={(e) => setAgree((s) => ({ ...s, b: e.target.checked }))} />
                <span>個別患者の診断・治療方針の決定には使用しません。</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={agree.c} onChange={(e) => setAgree((s) => ({ ...s, c: e.target.checked }))} />
                <span>患者を特定できる情報（氏名・ID 等）を入力しません。</span>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <Button onClick={() => setIsAboutOpen(true)}>このアプリについて</Button>
              <Button onClick={acceptConsent} disabled={!(agree.a && agree.b && agree.c)} className={!(agree.a && agree.b && agree.c) ? 'opacity-60 cursor-not-allowed' : ''}>同意して開始</Button>
            </div>
          </div>
        </Modal>
      )}

      <style>{`
        /* Always-on faint watermark */
        body::before {
          content: attr(data-wm);
          position: fixed; top: 50%; left: 0; right: 0; text-align: center;
          transform: rotate(-20deg) translateY(-50%);
          font-size: 14px; color: #9CA3AF; opacity: 0.15;
          pointer-events: none; z-index: 0;
        }
        /* keep app UI above the watermark */
        body > div { position: relative; z-index: 1; }

        @media print {
          .no-print { display: none !important; }
          .app-version { display: none !important; }
          body::before { opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
