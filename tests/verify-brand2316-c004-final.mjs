// v2.3.16 C004最終再現テスト（2026-11-21）: API通信なし・保存済み結果を模したデータのみ
// 対象: app/brand-search-v2316-c004-fix2.html（配信中の dev-v2316 と SHA-256 一致を確認済みのファイル）
// 実施方法: jsdom 上で実際のHTMLを読み込み、関数判定＋画面表示（復元・履歴一覧・まとめ・コピー）を確認する。
// 保存領域はテスト専用ページ内の一時 localStorage のみ。実データには触れない。
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const pick = (...us) => us.find(u => fs.existsSync(u)) || us[0]; // リポジトリ配置とローカル配置の両対応
const FILE = pick(new URL('../dev-v2316/index.html', import.meta.url), new URL('../app/brand-search-v2316-c004-fix2.html', import.meta.url));
const html = fs.readFileSync(FILE, 'utf8');
let pass = 0, fail = 0; const fails = [];
function check(name, cond){ if(cond){ pass++; console.log('PASS', name); } else { fail++; fails.push(name); console.log('FAIL', name); } }
const wait = ms => new Promise(r => setTimeout(r, ms));
const WORK = 'brand-search-v2316-test';
const HIST = 'brand-search-history-v2316-test';

// ---------- ページ生成（作業データ＋履歴を一時領域に種まき） ----------
async function makePage(seed, histSeed){
  const dom = new JSDOM(html, { url: 'https://example.com/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w){
      if(seed) w.localStorage.setItem(WORK, JSON.stringify(seed));
      if(histSeed) w.localStorage.setItem(HIST, JSON.stringify(histSeed));
      w.confirm = () => true;
    } });
  const { window } = dom;
  await wait(120);
  return { window, $: id => window.document.getElementById(id), doc: window.document };
}
const gem = w => w.__gemini;

// ---------- AI応答を模したデータ（検索直後の判定に使う形） ----------
function aiData(maker, conf, stamp, extra = {}){
  return { material: '陶磁器', category: '現代のブランド食器',
    observed_facts: { surface: ['染錦の牡丹文'], backstamp_text: stamp, backstamp_logo: extra.logo || '', shape_and_size_notes: [] },
    identification_candidates: [{ maker, origin: '有田焼', series: null, pattern_name: '染錦牡丹文', pattern_confidence: 60, product_name: '両手付カップ＆ソーサー', country: '日本', era_estimate: '現代', basis: ['絵柄'], contradicting_evidence: [], brand_confidence: conf, series_confidence: 0, uncertainty: '', stamp_evidence: '', pattern_evidence: '染錦・色絵', form_evidence: '両手付カップ' }],
    unreadable_or_uncertain: [], value_alert: { possible: false, reason: '' }, price_band_estimate: null };
}
// runGemini 内の価格決定と同じ組み立て（窯元確認→抑止判定→推定の採用可否）
function decidePrice(g, data, pe){
  const kc = g.assessKilnVerification(data);
  const blocked = g.aiPriceKilnBlocked(kc);
  const peValid = !!(pe && Number(pe.low) > 0 && Number(pe.high) >= Number(pe.low));
  return { kc, blocked, estimate: (!blocked && peValid) ? { low: pe.low, high: pe.high, unit: pe.unit || '1客あたり', perItem: true } : null };
}

// ---------- 保存データの形（アプリの collectState 形式を模す） ----------
function seedState(over){
  return Object.assign({ v: 2, facts: { surface: '', back: '', logo: '' }, candidates: [], priceRows: [], priceEstimate: null,
    material: { type: '陶磁器', confidence: 90, basis: '' }, valueAlert: { possible: false, reason: '' },
    category: { type: '現代のブランド食器', confidence: 80, basis: '' }, itemType: { type: 'カップ＆ソーサー', confidence: 80, basis: '両手付カップ' },
    candExtras: [{ stamp: '', pattern: '', form: '' }], keywords: [], images: { surface: null, back: null }, stampSamples: [] }, over);
}
const cand = (maker, confidence, extra = {}) => Object.assign({ maker, confidence, origin: '有田焼', series: '', seriesConfidence: 0, product_name: '両手付カップ＆ソーサー', pattern_name: '染錦牡丹文', patternConfidence: 60, basis: '染錦・色絵の牡丹文、金彩', country: '日本', era: '', uncertainty: '' }, extra);
const KC_READ = { maker: '源右衛門窯', stampState: 'read', stampLabel: '転記に窯元名あり（一致だけでは確定しない）', stampOtherKilns: [], competitors: [], unverified: false, caution: false, priceBlock: false };
const KC_MISMATCH = { maker: '源右衛門窯', stampState: 'mismatch', stampLabel: '転記に第一候補の窯元名が含まれない', stampOtherKilns: [], competitors: [], unverified: true, caution: true, priceBlock: false };
const PE_5000 = { low: 5000, high: 15000, note: '', unit: '1客あたり', perItem: true, count: null, countNote: '' };
const PE_OLD = { low: 10000, high: 25000, note: '', unit: '1客あたり', perItem: true, count: null, countNote: '' };

// ============================================================
// テスト① C004・正しい転記（源右衛門／確信度90%／5,000〜15,000円）
// ============================================================
{
  const p = await makePage(null); const g = gem(p.window);
  const d = aiData('源右衛門窯', 90, '源右衛門');
  const r = decidePrice(g, d, PE_5000);
  check('①-1 窯元判定は read（転記一致）', r.kc && r.kc.stampState === 'read' && r.kc.unverified === false);
  check('①-2 AI価格は抑止されない', r.blocked === false && !!r.estimate);
  const guard = g.computeKilnGuard(d);
  check('①-3 40%制限はかからない（ガード自体が発動せず、確信度90%のまま）', guard === null);
  const tier = g.bandTier({ low: 5000, high: 15000, unitKind: 'per_item' }, { high: false, reasons: [] });
  check('①-4 3,000円判定は「高額候補」', tier.name === '高額候補');
}
{ // 画面表示: read の保存結果を復元
  const seed = seedState({ candidates: [cand('源右衛門窯', 90)],
    facts: { surface: '染錦で牡丹を描く。金彩の縁取り', back: '源右衛門', logo: '' },
    kilnCheck: KC_READ, priceEstimate: PE_5000, priceStatus: { code: 'shown', text: '' } });
  const p = await makePage(seed);
  check('①-5 画面: AI参考価格 5,000 〜 15,000 円が表示される', p.$('bandBox').textContent.includes('5,000 〜 15,000 円') && p.$('priceEstBox').textContent.includes('5,000 〜 15,000 円'));
  check('①-6 画面: 判定は「高額候補」で、窯元要確認の警告は出ない', p.$('bandBox').textContent.includes('高額候補') && !p.$('bandBox').textContent.includes('窯元要確認'));
}

// ============================================================
// テスト② C004・1文字読み違い（源右工門／ロゴに推測あり／85%／10,000〜25,000円）
// ============================================================
{
  const p = await makePage(null); const g = gem(p.window);
  const d = aiData('源右衛門窯', 85, '源右工門', { logo: '源右衛門窯の銘と推測される' });
  const r = decidePrice(g, d, PE_OLD);
  check('②-1 窯元判定は mismatch（ロゴの推測では read にならない）', r.kc && r.kc.stampState === 'mismatch');
  const guard = g.computeKilnGuard(d);
  check('②-2 ブランド確信度は40%に制限される', !!guard && guard.capped === 40);
  check('②-3 AI参考価格は抑止される（非表示）', r.blocked === true && r.estimate === null);
  check('②-4 判定統一: unverified ＝ 転記で窯元名が確認できない', r.kc.unverified === true && g.kilnNameConfirmed(d) === false && g.aiPriceKilnBlocked(r.kc) === r.kc.unverified);
}
{ // 画面表示: 検索直後相当（priceStatus=kiln_unverified で保存された状態）
  const seed = seedState({ candidates: [cand('源右衛門窯', 40)],
    facts: { surface: '染錦で牡丹を描く。金彩の縁取り', back: '源右工門', logo: '源右衛門窯の銘と推測される' },
    candExtras: [{ stamp: '', pattern: '染錦・色絵の牡丹文', form: '両手付カップ' }],
    kilnGuard: { maker: '源右衛門窯', aiConfidence: 85, capped: 40, stampState: 'mismatch' },
    kilnCheck: KC_MISMATCH, priceEstimate: null,
    priceStatus: { code: 'kiln_unverified', text: '窯元の確認が取れていないため、AI参考価格を表示していません' } });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  check('②-5 画面: 「価格不明」が表示される', band.includes('価格不明'));
  check('②-6 画面: 金額（10,000／25,000）は出ない', !band.includes('10,000') && !band.includes('25,000'));
  check('②-7 画面: 根拠がそろうため「高額候補の可能性あり・窯元要確認」が出る', band.includes('高額候補の可能性あり・窯元要確認'));
  check('②-8 画面: 候補の確信度表示は40%（制限後）', (p.$('candidates').textContent || '').includes('40') || (p.$('result').textContent || '').includes('40'));
}

// ============================================================
// テスト③ 保存済み結果の復元（テスト②の模擬結果を一時データから復元）
// ============================================================
let reloadedSeed = null;
{
  // fix2より前に「価格表示済み」で保存されてしまった形を再現
  const seed = seedState({ candidates: [cand('源右衛門窯', 40)],
    facts: { surface: '染錦で牡丹を描く。金彩の縁取り', back: '源右工門', logo: '源右衛門窯の銘と推測される' },
    candExtras: [{ stamp: '', pattern: '染錦・色絵の牡丹文', form: '両手付カップ' }],
    kilnGuard: { maker: '源右衛門窯', aiConfidence: 85, capped: 40, stampState: 'mismatch' },
    kilnCheck: KC_MISMATCH, priceEstimate: PE_OLD, priceStatus: { code: 'shown', text: '' },
    resultHtml: '<p>旧表示: AI参考価格 10,000〜25,000円</p>', lastSummary: '価格帯（中古）: 10,000〜25,000円［AI参考推定（未検証）／単位: 1客あたり］ 判定: 高額候補' });
  const histEntry = { id: 'htest1', savedAt: new Date().toISOString(), fingerprint: 'test-fp-1',
    data: { facts: seed.facts, candidates: seed.candidates, priceRows: [], priceEstimate: PE_OLD,
      material: seed.material, valueAlert: seed.valueAlert, category: seed.category, itemType: seed.itemType,
      kilnGuard: seed.kilnGuard, kilnCheck: KC_MISMATCH, priceStatus: { code: 'shown', text: '' }, candExtras: seed.candExtras,
      keywords: [], resultHtml: seed.resultHtml, lastSummary: seed.lastSummary, condition: '1.0', dmg: [] } };
  const p = await makePage(seed, [histEntry]);
  const band = p.$('bandBox').textContent;
  check('③-1 復元: 判定欄に旧金額は出ず「価格不明」になる', !band.includes('10,000') && band.includes('価格不明'));
  check('③-2 復元: 価格欄に保留の理由が出る', p.$('priceEstBox').textContent.includes('保存されていたAI参考価格を表示していません'));
  check('③-3 復元: 結果表示は再生成され旧金額が残らない', !p.$('result').innerHTML.includes('25,000'));
  const hist = p.$('historyList').textContent;
  check('③-4 履歴一覧: 金額を出さず「表示を保留しています」になる', hist.includes('表示を保留しています') && !hist.includes('10,000'));
  p.$('btnShowResult').click();
  await wait(60);
  const saved = JSON.parse(p.window.localStorage.getItem(WORK) || '{}');
  check('③-5 コピー用テキスト（まとめ）: 再生成され旧金額を含まない', !(saved.lastSummary || '').includes('25,000') && !(saved.lastSummary || '').includes('10,000'));
  check('③-6 保存データの価格値は書き換えられない（10,000〜25,000が残る）', !!saved.priceEstimate && saved.priceEstimate.low === 10000 && saved.priceEstimate.high === 25000);
  reloadedSeed = saved;
}
{ // 再読み込み後も同じ安全判定（③の保存内容をそのまま新しいページへ）
  const p = await makePage(reloadedSeed);
  const band = p.$('bandBox').textContent;
  check('③-7 再読み込み後: 引き続き価格不明で旧金額は出ない', band.includes('価格不明') && !band.includes('10,000'));
  const saved2 = JSON.parse(p.window.localStorage.getItem(WORK) || '{}');
  check('③-8 再読み込み後: 保存データの価格値も保持されたまま', !!saved2.priceEstimate && saved2.priceEstimate.low === 10000 && saved2.priceEstimate.high === 25000);
}
{ // 確認済み成約価格の手入力は、AI価格が保留でも維持される
  const seed = seedState({ candidates: [cand('源右衛門窯', 40)],
    facts: { surface: '染錦で牡丹を描く。金彩の縁取り', back: '源右工門', logo: '' },
    candExtras: [{ stamp: '', pattern: '染錦・色絵の牡丹文', form: '両手付カップ' }],
    kilnCheck: KC_MISMATCH, priceEstimate: PE_OLD, priceStatus: { code: 'shown', text: '' },
    priceRows: [{ price: 12000, source: 'メルカリ', note: '' }, { price: 15000, source: 'ヤフオク', note: '' }] });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  check('③-9 手入力: 実績ベース 10,800 〜 16,200 円が表示され、AI価格の金額は混ざらない', band.includes('10,800 〜 16,200 円') && band.includes('実績ベース') && !band.includes('25,000'));
  check('③-10 手入力: 窯元未確認時の注意（対応を確認してください）が出る', band.includes('対応を確認してください'));
}

// ============================================================
// テスト④ 既存データへの影響
// ============================================================
{ // C003 読取不可ケース
  const seed = seedState({ candidates: [cand('源右衛門窯', 40, { product_name: '急須' })],
    facts: { surface: '赤絵の花文様、手描き', back: '[読取不可]', logo: '' },
    itemType: { type: 'その他（急須・茶器）', confidence: 80, basis: '急須の形状' },
    candExtras: [{ stamp: '', pattern: '赤絵・色絵の花文様', form: '急須' }],
    kilnCheck: { maker: '源右衛門窯', stampState: 'unreadable', stampLabel: '銘が不完全（読取不可・推測補完を含む）', stampOtherKilns: [], competitors: [], unverified: true, caution: true, priceBlock: true },
    priceStatus: { code: 'kiln_unverified', text: '窯元の確認が取れていないため、AI参考価格を表示していません' } });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  check('④-1 C003: 価格不明＋「高額候補の可能性あり・窯元要確認」を維持', band.includes('価格不明') && band.includes('高額候補の可能性あり・窯元要確認'));
  const g = gem(p.window);
  const d = aiData('柿右衛門', 60, '[読取不可]');
  check('④-2 C003: 読取不可では確信度40%制限が働く', (g.computeKilnGuard(d) || {}).capped === 40);
}
{ // C001 ロイヤルコペンハーゲン（西洋ブランドは窯元検証の対象外）
  const p = await makePage(null); const g = gem(p.window);
  const rc = aiData('Royal Copenhagen', 90, 'Royal Copenhagen Denmark');
  check('④-3 C001: 窯元検証の対象外で、AI価格は抑止されない', g.assessKilnVerification(rc) === null && decidePrice(g, rc, { low: 150000, high: 400000 }).estimate !== null);
  const seed = seedState({ candidates: [cand('Royal Copenhagen', 90, { origin: '', series: 'フローラダニカ', seriesConfidence: 80, product_name: 'ポット', pattern_name: '植物画', basis: '手描きの植物画・金彩・学名の記載' })],
    itemType: { type: 'その他', confidence: 80, basis: 'ポット' },
    candExtras: [{ stamp: 'Royal Copenhagen', pattern: '金彩・手描き・学名（ラテン語）', form: 'ポット' }],
    priceEstimate: { low: 150000, high: 400000, note: '', unit: '1点あたり', perItem: true, count: null, countNote: '' },
    priceStatus: { code: 'shown', text: '' } });
  const p2 = await makePage(seed);
  check('④-4 C001: 保存結果の復元でも 150,000 〜 400,000 円が従来どおり表示される', p2.$('bandBox').textContent.includes('150,000 〜 400,000 円'));
}
{ // C002 マイセン（価格なし保存の回帰）
  const seed = seedState({ candidates: [cand('Meissen（マイセン）', 80, { origin: '', product_name: 'カップ＆ソーサー', pattern_name: '波の戯れ', basis: '白磁の波状レリーフ' })],
    candExtras: [{ stamp: '', pattern: '白磁のレリーフ', form: '' }] });
  const p = await makePage(seed);
  check('④-5 C002: 「価格不明・要確認」のまま（高額候補の可能性ありは出ない）', p.$('bandBox').textContent.includes('価格不明・要確認') && !p.$('bandBox').textContent.includes('高額候補の可能性あり'));
}
{ // 保存キー・バックアップ互換性（ソース確認）
  check('④-6 保存キー・履歴キー・IDB名・APP_ID・バックアップ名が不変',
    html.includes("const STORE_KEY = 'brand-search-v2316-test'") &&
    html.includes("const HISTORY_STORE_KEY = 'brand-search-history-v2316-test'") &&
    html.includes("const IDB_NAME = 'shokki-brand-search-v2316-test'") &&
    html.includes("const APP_ID = 'shokki-brand-search-v2316-test'") &&
    html.includes('shokki-brand-backup-v2316-test.json'));
  check('④-7 GEN_CONFIG は temperature 0.2 のまま（送信仕様の変更なし）', /const GEN_CONFIG = \{[^}]*temperature: 0\.2/.test(html));
}
{ // 起動だけでは保存データは上書きされない
  const seed = seedState({ candidates: [cand('源右衛門窯', 90)], priceEstimate: PE_5000 });
  const p = await makePage(seed);
  check('④-8 起動だけでは保存データは上書きされない', p.window.localStorage.getItem(WORK) === JSON.stringify(seed));
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if(fails.length) console.log('FAILED:', fails.join(' / '));
process.exit(fail ? 1 : 0);
