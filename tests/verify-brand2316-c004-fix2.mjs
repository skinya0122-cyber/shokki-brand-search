// v2.3.16 C004追加補修 検証: API通信なしの模擬テスト
// 対象: app/brand-search-v2316-c004-fix2.html（c004-fix＋補修①転記のみで窯元名確認＋補修②復元時のAI価格再評価）
// 項目: 1) C004 read は通常表示 2) C004 mismatch は非表示 3) ロゴの推測では read にしない
//       4) [読取不可]＋ロゴに窯元名でも非表示 5) 旧保存データの復元で保留（データ自体は保持）
//       6) 手入力成約価格は維持 7) C001・C002は不変 8) 保存形式・履歴・バックアップの互換性
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const pick = (...us) => us.find(u => fs.existsSync(u)) || us[0]; // リポジトリ配置とローカル配置の両対応
const NEW = pick(new URL('../dev-v2316/index.html', import.meta.url), new URL('../app/brand-search-v2316-c004-fix2.html', import.meta.url));
const OLD = pick(new URL('./fixtures/brand-search-v2316-c004-fix.html', import.meta.url), new URL('../app/brand-search-v2316-c004-fix.html', import.meta.url));
const html = fs.readFileSync(NEW, 'utf8');
const old = fs.readFileSync(OLD, 'utf8');
let pass = 0, fail = 0;
function check(name, cond){ if(cond){ pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); } }
const wait = ms => new Promise(r => setTimeout(r, ms));
const WORK = 'brand-search-v2316-test';

// ---- ソース確認（項目8） ----
check('S1 保存キーが不変', html.includes("const STORE_KEY = 'brand-search-v2316-test'") && html.includes("const HISTORY_STORE_KEY = 'brand-search-history-v2316-test'") && html.includes("const IDB_NAME = 'shokki-brand-search-v2316-test'") && html.includes("const APP_ID = 'shokki-brand-search-v2316-test'") && html.includes('shokki-brand-backup-v2316-test.json'));
check('S2 GEN_CONFIGブロックがc004-fixと同一', html.slice(html.indexOf('const GEN_CONFIG'), html.indexOf('};', html.indexOf('const GEN_CONFIG'))) === old.slice(old.indexOf('const GEN_CONFIG'), old.indexOf('};', old.indexOf('const GEN_CONFIG'))));
check('S3 collectStateの保存項目が不変', ['kilnGuard, kilnCaution, kilnCheck, priceStatus: lastPriceStatus, candExtras: lastCandidateExtras'].every(t => html.includes(t)));
check('S4 補修①: assessKilnVerification がロゴを連結しない', html.includes('const stampText = rawText;') && !html.slice(html.indexOf('function assessKilnVerification'), html.indexOf('function brandNoticeState')).includes('f.backstamp_logo'));
check('S5 補修②: 履歴一覧でも保留表示に切り替える', html.includes('AI参考価格: 窯元未確認のため表示を保留しています'));
check('S6 補修②: collectState は priceEstimate をそのまま保存する（値を消さない）', html.includes('priceEstimate,') && html.slice(html.indexOf('function collectState'), html.indexOf('function saveNow')).includes('priceEstimate'));

async function makePage(seed, src){
  const dom = new JSDOM(src || html, { url: 'https://example.com/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w){ if(seed) w.localStorage.setItem(WORK, JSON.stringify(seed)); w.confirm = () => true; } });
  const { window } = dom;
  await wait(90);
  return { window, $: id => window.document.getElementById(id), doc: window.document };
}
const gem = w => w.__gemini;
function aiData(maker, conf, stamp, extra = {}){
  return { material: '陶磁器', category: '現代のブランド食器',
    observed_facts: { surface: ['染錦の牡丹文'], backstamp_text: stamp, backstamp_logo: extra.logo || '', shape_and_size_notes: [] },
    identification_candidates: [{ maker, origin: '有田焼', series: null, pattern_name: '染錦牡丹文', pattern_confidence: 60, product_name: '両手付カップ＆ソーサー', country: '日本', era_estimate: '現代', basis: ['絵柄'], contradicting_evidence: [], brand_confidence: conf, series_confidence: 0, uncertainty: '', stamp_evidence: '', pattern_evidence: '染錦・色絵', form_evidence: '両手付カップ' }],
    unreadable_or_uncertain: [], value_alert: { possible: false, reason: '' }, price_band_estimate: null };
}
function decidePrice(g, data, pe){
  const kc = g.assessKilnVerification(data);
  const blocked = g.aiPriceKilnBlocked(kc);
  const peValid = !!(pe && Number(pe.low) > 0 && Number(pe.high) >= Number(pe.low));
  return { kc, blocked, estimate: (!blocked && peValid) ? { low: pe.low, high: pe.high } : null };
}

// ---- 補修① 単位テスト ----
{
  const p = await makePage(null); const g = gem(p.window);
  const po = await makePage(null, old); const go = gem(po.window);

  const r1 = decidePrice(g, aiData('源右衛門窯', 90, '源右衛門'), { low: 5000, high: 15000 });
  check('T1 C004 1回目（転記「源右衛門」）: read でAI価格が通る', r1.kc.stampState === 'read' && !!r1.estimate);

  const r2 = decidePrice(g, aiData('源右衛門窯', 85, '源右工門'), { low: 10000, high: 25000 });
  check('T2 C004 2回目（転記「源右工門」）: mismatch でAI価格非表示', r2.kc.stampState === 'mismatch' && r2.estimate === null);

  const d3 = aiData('源右衛門窯', 85, '源右工門', { logo: '源右衛門窯と推測される銘' });
  const r3 = decidePrice(g, d3, { low: 10000, high: 25000 });
  check('T3a 項目3: ロゴに推測の窯元名があっても read にしない（mismatch）', r3.kc.stampState === 'mismatch');
  check('T3b 項目3: AI価格は非表示・40%制限と矛盾しない', r3.estimate === null && g.kilnNameConfirmed(d3) === false && (g.computeKilnGuard(d3) || {}).capped === 40);
  const r3old = decidePrice(go, d3, { low: 10000, high: 25000 });
  check('T3c 対照: 旧版ではロゴの推測で read になり価格が通っていた（補修前の問題を再現）', r3old.kc.stampState === 'read' && !!r3old.estimate);

  const d3b = aiData('源右衛門窯', 80, '有田', { logo: '源右衛門窯の銘のような形状' });
  check('T3d 転記に窯元名がなくロゴだけにある場合も mismatch で非表示', decidePrice(g, d3b, { low: 5000, high: 9000 }).estimate === null && g.assessKilnVerification(d3b).stampState === 'mismatch');

  const d4 = aiData('源右衛門窯', 70, '[読取不可]', { logo: '源右衛門窯の銘と思われる形状' });
  const r4 = decidePrice(g, d4, { low: 10000, high: 25000 });
  check('T4 項目4: 転記[読取不可]＋ロゴに窯元名でも unreadable でAI価格非表示', r4.kc.stampState === 'unreadable' && r4.estimate === null && (g.computeKilnGuard(d4) || {}).capped === 40);

  // 一致性マトリクス（読取不可マーカーのないケース）: assess の unverified と kilnNameConfirmed が矛盾しない
  const cases = [
    aiData('源右衛門窯', 90, '源右衛門'),
    aiData('源右衛門窯', 85, '源右工門', { logo: '源右衛門窯と推測' }),
    aiData('柿右衛門', 80, '有田', { logo: '柿右衛門のロゴのような形状' }),
    aiData('源右衛門窯', 80, '', { logo: '源右衛門窯' }),
    aiData('香蘭社', 80, 'KORANSHA'),
    aiData('源右衛門窯', 80, '柿右衛門'),
  ];
  check('T5 判定統一: unverified ＝ !kilnNameConfirmed（全ケース）', cases.every(d => { const kc = g.assessKilnVerification(d); return kc && kc.unverified === !g.kilnNameConfirmed(d) && g.aiPriceKilnBlocked(kc) === kc.unverified; }));

  const rc = aiData('Royal Copenhagen', 90, 'Royal Copenhagen Denmark');
  check('T6 西洋ブランドは窯元検証の対象外（不変）', g.assessKilnVerification(rc) === null && decidePrice(g, rc, { low: 100000, high: 200000 }).estimate !== null);
}

// ---- 画面表示・復元テスト ----
function seedState(over){
  return Object.assign({ v: 2, facts: { surface: '', back: '', logo: '' }, candidates: [], priceRows: [], priceEstimate: null,
    material: { type: '陶磁器', confidence: 90, basis: '' }, valueAlert: { possible: false, reason: '' },
    category: { type: '現代のブランド食器', confidence: 80, basis: '' }, itemType: { type: 'カップ＆ソーサー', confidence: 80, basis: '両手付カップ' },
    candExtras: [{ stamp: '', pattern: '', form: '' }], keywords: [], images: { surface: null, back: null }, stampSamples: [] }, over);
}
const cand = (maker, confidence, extra = {}) => Object.assign({ maker, confidence, origin: '有田焼', series: '', seriesConfidence: 0, product_name: '両手付カップ＆ソーサー', pattern_name: '染錦牡丹文', patternConfidence: 60, basis: '染錦・色絵の牡丹文、金彩', country: '日本', era: '', uncertainty: '' }, extra);
const KC_MISMATCH = { maker: '源右衛門窯', stampState: 'mismatch', stampLabel: '転記に第一候補の窯元名が含まれない', stampOtherKilns: [], competitors: [], unverified: true, caution: true, priceBlock: false };
const PE_OLD = { low: 10000, high: 25000, note: '', unit: '1客あたり', perItem: true, count: null, countNote: '' };

{ // 項目5: fix2時代に保存された mismatch の結果（価格表示済み）を復元 → 表示は保留、データは保持
  const seed = seedState({ candidates: [cand('源右衛門窯', 40)],
    facts: { surface: '染錦で牡丹を描く。金彩の縁取り', back: '源右工門', logo: '' },
    candExtras: [{ stamp: '', pattern: '染錦・色絵の牡丹文', form: '両手付カップ' }],
    kilnGuard: { maker: '源右衛門窯', aiConfidence: 85, capped: 40, stampState: 'mismatch' },
    kilnCheck: KC_MISMATCH, priceEstimate: PE_OLD, priceStatus: { code: 'shown', text: '' },
    resultHtml: '<p>旧表示: AI参考価格 10,000〜25,000円</p>', lastSummary: '価格帯（中古）: 10,000〜25,000円［AI参考推定（未検証）／単位: 1客あたり］ 判定: 高額候補' });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  check('V5a 復元: 判定欄に旧金額は出ず、価格不明＋保留警告になる', !band.includes('10,000') && band.includes('価格不明') && band.includes('高額候補の可能性あり・窯元要確認'));
  check('V5b 復元: 価格欄に保留の理由が出る', p.$('priceEstBox').textContent.includes('保存されていたAI参考価格を表示していません'));
  check('V5c 復元: 結果表示は再生成され旧金額が残らない', !p.$('result').innerHTML.includes('25,000') && p.$('result').innerHTML.includes('判定: 高額候補の可能性あり・窯元要確認'));
  p.$('btnShowResult').click();
  await wait(40);
  const saved = JSON.parse(p.window.localStorage.getItem(WORK) || '{}');
  check('V5d 保存データ自体は保持される（priceEstimateの値は消えない）', !!saved.priceEstimate && saved.priceEstimate.low === 10000 && saved.priceEstimate.high === 25000);
  check('V5e コピー用テキストは再生成され旧金額を含まない', !(saved.lastSummary || '').includes('25,000') && (saved.lastSummary || '').includes('判定: 高額候補の可能性あり・窯元要確認'));
}
{ // 項目5b: ロゴ推測で read 扱いだった旧保存（kilnCheck=read）も、復元時の再評価で保留になる
  const seed = seedState({ candidates: [cand('源右衛門窯', 90)],
    facts: { surface: '染錦で牡丹を描く。金彩の縁取り', back: '源右工門', logo: '源右衛門窯と推測される銘' },
    candExtras: [{ stamp: '', pattern: '染錦・色絵の牡丹文', form: '両手付カップ' }],
    kilnCheck: { maker: '源右衛門窯', stampState: 'read', stampLabel: '転記に窯元名あり（一致だけでは確定しない）', stampOtherKilns: [], competitors: [], unverified: false, caution: false, priceBlock: false },
    priceEstimate: PE_OLD, priceStatus: { code: 'shown', text: '' } });
  const p = await makePage(seed);
  check('V5f ロゴ由来readの旧保存も再評価で保留（金額が出ない）', !p.$('bandBox').textContent.includes('10,000') && p.$('priceEstBox').textContent.includes('保存されていたAI参考価格を表示していません'));
}
{ // 項目6: 手入力の成約価格は、保留対象のAI価格があっても維持される
  const seed = seedState({ candidates: [cand('源右衛門窯', 40)],
    facts: { surface: '染錦で牡丹を描く。金彩の縁取り', back: '源右工門', logo: '' },
    candExtras: [{ stamp: '', pattern: '染錦・色絵の牡丹文', form: '両手付カップ' }],
    kilnCheck: KC_MISMATCH, priceEstimate: PE_OLD, priceStatus: { code: 'shown', text: '' },
    priceRows: [{ price: 12000, source: 'メルカリ', note: '' }, { price: 15000, source: 'ヤフオク', note: '' }] });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  check('V6 手入力: 実績ベース 10,800 〜 16,200 円が表示され、AI価格の金額は混ざらない', band.includes('10,800 〜 16,200 円') && band.includes('実績ベース') && !band.includes('25,000') && band.includes('対応を確認してください'));
}
{ // 項目7: C001相当の保存（西洋・価格あり）は復元後もそのまま表示
  const seed = seedState({ candidates: [cand('Royal Copenhagen', 90, { origin: '', series: 'フローラダニカ', seriesConfidence: 80, product_name: 'ポット', pattern_name: '植物画', basis: '手描きの植物画・金彩・学名の記載' })],
    itemType: { type: 'その他', confidence: 80, basis: 'ポット' },
    candExtras: [{ stamp: 'Royal Copenhagen', pattern: '金彩・手描き・学名（ラテン語）', form: 'ポット' }],
    priceEstimate: { low: 150000, high: 400000, note: '', unit: '1点あたり', perItem: true, count: null, countNote: '' },
    priceStatus: { code: 'shown', text: '' } });
  const p = await makePage(seed);
  check('V7a C001復元: AI参考価格 150,000 〜 400,000 円が従来どおり表示される', p.$('bandBox').textContent.includes('150,000 〜 400,000 円') && p.$('priceEstBox').textContent.includes('150,000 〜 400,000 円'));
  const seed2 = seedState({ candidates: [cand('Meissen（マイセン）', 80, { origin: '', product_name: 'カップ＆ソーサー', pattern_name: '波の戯れ', basis: '白磁の波状レリーフ' })],
    candExtras: [{ stamp: '', pattern: '白磁のレリーフ', form: '' }] });
  const p2 = await makePage(seed2);
  check('V7b C002回帰: 「価格不明・要確認」のまま', p2.$('bandBox').textContent.includes('価格不明・要確認') && !p2.$('bandBox').textContent.includes('高額候補の可能性あり'));
}
{ // 項目1の表示: read の保存は従来どおり
  const seed = seedState({ candidates: [cand('源右衛門窯', 90)],
    facts: { surface: '染錦で牡丹を描く', back: '源右衛門', logo: '' },
    kilnCheck: { maker: '源右衛門窯', stampState: 'read', stampLabel: '転記に窯元名あり（一致だけでは確定しない）', stampOtherKilns: [], competitors: [], unverified: false, caution: false, priceBlock: false },
    priceEstimate: { low: 5000, high: 15000, note: '', unit: '1客あたり', perItem: true, count: null, countNote: '' },
    priceStatus: { code: 'shown', text: '' } });
  const p = await makePage(seed);
  check('V1 C004 1回目の保存: AI参考価格 5,000 〜 15,000 円が従来どおり表示される', p.$('bandBox').textContent.includes('5,000 〜 15,000 円') && p.$('priceEstBox').textContent.includes('5,000 〜 15,000 円'));
}
{ // C003回帰
  const seed = seedState({ candidates: [cand('源右衛門窯', 40, { product_name: '急須' })],
    facts: { surface: '赤絵の花文様、手描き', back: '[読取不可]', logo: '' },
    itemType: { type: 'その他（急須・茶器）', confidence: 80, basis: '急須の形状' },
    candExtras: [{ stamp: '', pattern: '赤絵・色絵の花文様', form: '急須' }],
    kilnCheck: { maker: '源右衛門窯', stampState: 'unreadable', stampLabel: '銘が不完全（読取不可・推測補完を含む）', stampOtherKilns: [], competitors: [], unverified: true, caution: true, priceBlock: true },
    priceStatus: { code: 'kiln_unverified', text: '窯元の確認が取れていないため、AI参考価格を表示していません' } });
  const p = await makePage(seed);
  check('V8 C003回帰: 価格不明＋「高額候補の可能性あり・窯元要確認」を維持', p.$('bandBox').textContent.includes('価格不明') && p.$('bandBox').textContent.includes('高額候補の可能性あり・窯元要確認'));
}
{ // 項目8: 保存データは起動だけでは上書きされない
  const seed = seedState({ candidates: [cand('源右衛門窯', 90)], priceEstimate: { low: 5000, high: 15000, note: '', unit: '1客あたり', perItem: true, count: null, countNote: '' } });
  const p = await makePage(seed);
  check('V9 保存データは起動だけでは上書きされない', p.window.localStorage.getItem(WORK) === JSON.stringify(seed));
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
