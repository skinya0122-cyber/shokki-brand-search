// v2.3.16 C003修正・最終レビュー対応 検証: API通信なしの模擬テスト
// 対象: app/brand-search-v2316-c003-fix2.html（c003-fix＋最終レビュー2点の修正）
// 追加項目: R) ロゴ欄の推測では窯元名確認済みにしない A) 古陶磁器可能性ありでも判定欄・まとめ・コピーが bandTier で一致
// 項目: 1) C003条件で窯元未確定＋40%上限 2) 根拠があれば高額保留ラベル維持
//       3) 銘明瞭な源右衛門窯を抑制しない 4) 銘明瞭な柿右衛門も同様
//       5) 無銘・根拠薄では過剰警告しない 6) C001/C002の既存判定が不変
//       7) 保存・履歴・バックアップ形式（キーと保存項目）が不変
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const pick = (...us) => us.find(u => fs.existsSync(u)) || us[0]; // リポジトリ配置とローカル配置の両対応
const NEW = pick(new URL('./fixtures/brand-search-v2316-c003-fix2.html', import.meta.url), new URL('../app/brand-search-v2316-c003-fix2.html', import.meta.url));
const OLD = pick(new URL('./fixtures/brand-search-v2316-c003-fix.html', import.meta.url), new URL('../app/brand-search-v2316-c003-fix.html', import.meta.url));
const html = fs.readFileSync(NEW, 'utf8');
const old = fs.readFileSync(OLD, 'utf8');
let pass = 0, fail = 0;
function check(name, cond){ if(cond){ pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); } }
const wait = ms => new Promise(r => setTimeout(r, ms));
const WORK = 'brand-search-v2316-test';

// ---- ソース確認（修正4: 変更しないもの） ----
check('S1 保存キーが不変', html.includes("const STORE_KEY = 'brand-search-v2316-test'") && html.includes("const HISTORY_STORE_KEY = 'brand-search-history-v2316-test'") && html.includes("const IDB_NAME = 'shokki-brand-search-v2316-test'"));
check('S2 APP_IDが不変', html.includes("const APP_ID = 'shokki-brand-search-v2316-test'"));
check('S3 GEN_CONFIGブロックがfix3と同一', html.slice(html.indexOf('const GEN_CONFIG'), html.indexOf('};', html.indexOf('const GEN_CONFIG'))) === old.slice(old.indexOf('const GEN_CONFIG'), old.indexOf('};', old.indexOf('const GEN_CONFIG'))));
check('S4 写真の妥当性チェック（checkImageData）が残る', html.includes('function checkImageData') && html.includes('runGemini送信前に画像を再検証') === false || html.includes('checkImageData'));
check('S5 プロンプトに(5-2)有田判別補助がある', html.includes('(5-2)有田窯元の判別補助'));
check('S6 プロンプト冒頭の列挙に柿右衛門・今右衛門が入る', html.includes('柿右衛門、源右衛門窯、今右衛門、香蘭社、深川製磁、ノリタケ'));
check('S7 源右衛門単独の蕎麦猪口ルールが一般化された', !html.includes('窯名が確認できない蕎麦猪口を源右衛門窯とは判定しない'));
check('S8 西洋シリーズ補助(7-2)がfix3から不変', html.slice(html.indexOf('(7-2)シリーズ照合の補助'), html.indexOf('(8)候補は確信度順')) === old.slice(old.indexOf('(7-2)シリーズ照合の補助'), old.indexOf('(8)候補は確信度順')));
check('S9 collectStateの保存項目が不変', ['kilnGuard, kilnCaution, kilnCheck, priceStatus: lastPriceStatus, candExtras: lastCandidateExtras'].every(t => html.includes(t)));

async function makePage(seed){
  const dom = new JSDOM(html, { url: 'https://example.com/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w){ if(seed) w.localStorage.setItem(WORK, JSON.stringify(seed)); w.confirm = () => true; } });
  const { window } = dom;
  await wait(90);
  return { window, $: id => window.document.getElementById(id), doc: window.document };
}
const gem = w => w.__gemini;
function aiData(maker, conf, stamp, extra = {}){
  return { material: '陶磁器', category: '現代のブランド食器',
    observed_facts: { surface: ['赤絵の花文様'], backstamp_text: stamp, backstamp_logo: extra.logo || '', shape_and_size_notes: [] },
    identification_candidates: [{ maker, origin: '有田焼', series: null, pattern_name: extra.pattern || '赤絵花文', pattern_confidence: 60, product_name: extra.product || '急須', country: '日本', era_estimate: '現代', basis: ['絵柄'], contradicting_evidence: [], brand_confidence: conf, series_confidence: 0, uncertainty: '', stamp_evidence: '', pattern_evidence: '赤絵・色絵', form_evidence: '急須' }],
    unreadable_or_uncertain: [], value_alert: { possible: false, reason: '' }, price_band_estimate: null };
}

// ---- 単位テスト（__gemini 経由） ----
{
  const p = await makePage(null); const g = gem(p.window);
  check('U0 テスト用関数が公開されている', typeof g.computeKilnGuard === 'function' && typeof g.highValueEvidence === 'function' && typeof g.bandTier === 'function');

  // 項目1: C003条件（源右衛門窯60%・銘[読取不可]）→ 40%上限・窯元未確定
  const d1 = aiData('源右衛門窯', 60, '[読取不可]');
  const kc1 = g.assessKilnVerification(d1);
  const gd1 = g.computeKilnGuard(d1);
  check('T1a C003条件: 窯元検証は unverified（銘が不完全）', !!kc1 && kc1.unverified === true && kc1.stampState === 'unreadable' && kc1.priceBlock === true);
  check('T1b C003条件: ガードが40%上限で発動（aiConfidence=60）', !!gd1 && gd1.capped === 40 && gd1.aiConfidence === 60);
  check('T1c C003条件: 窯元名は未確認（kilnNameConfirmed=false）', g.kilnNameConfirmed(d1) === false);

  // 項目3: 銘が明瞭な本物の源右衛門窯 → 抑制しない
  const d3 = aiData('源右衛門窯', 85, '源右衛門窯');
  check('T3a 源右衛門・銘明瞭: ガード非発動', g.computeKilnGuard(d3) === null);
  check('T3b 源右衛門・銘明瞭: read判定で価格抑止なし', g.assessKilnVerification(d3).stampState === 'read' && g.assessKilnVerification(d3).priceBlock === false);

  // 項目4: 銘が明瞭な柿右衛門 → 同様に抑制しない
  const d4 = aiData('柿右衛門', 80, '柿右衛門');
  check('T4a 柿右衛門・銘明瞭: ガード非発動', g.computeKilnGuard(d4) === null);
  check('T4b 柿右衛門・銘明瞭: read判定', g.assessKilnVerification(d4).stampState === 'read');

  // 二段ガード: 窯元名は読めたが他の部分が[読取不可] → 従来の69%上限（40%まで落とさない）
  const d5 = aiData('源右衛門窯', 85, '源右衛門窯 [読取不可]');
  const gd5 = g.computeKilnGuard(d5);
  check('T5 窯元名あり＋一部読取不可: 69%上限のまま', !!gd5 && gd5.capped === 69);

  // 公平化: 今右衛門も検証・ガードの対象
  const d6 = aiData('今右衛門', 70, '[読取不可]');
  check('T6a 今右衛門が kilnKeyOf の対象', g.kilnKeyOf('今右衛門') === '今右衛門');
  check('T6b 今右衛門・銘未確認: 40%上限', (g.computeKilnGuard(d6) || {}).capped === 40);
  const d6b = aiData('今右衛門', 75, '今右衛門');
  check('T6c 今右衛門・銘明瞭: ガード非発動', g.computeKilnGuard(d6b) === null);

  // 転記に別の窯元名（矛盾）→ 窯元名未確認として40%上限
  const d7 = aiData('源右衛門窯', 60, '柿右衛門');
  check('T7 転記が柿右衛門で第一候補が源右衛門窯: 40%上限', (g.computeKilnGuard(d7) || {}).capped === 40);

  // 西洋ブランドは窯元ガードの対象外
  const d8 = aiData('Meissen（マイセン）', 80, 'Meissen');
  check('T8 マイセンは窯元ガード対象外', g.computeKilnGuard(d8) === null && g.assessKilnVerification(d8) === null);
}

// ---- 画面表示テスト（保存データ復元→renderBand） ----
function seedState(over){
  return Object.assign({ v: 2, facts: { surface: '', back: '', logo: '' }, candidates: [], priceRows: [], priceEstimate: null,
    material: { type: '陶磁器', confidence: 90, basis: '' }, valueAlert: { possible: false, reason: '' },
    category: { type: '現代のブランド食器', confidence: 80, basis: '' }, itemType: { type: 'その他（急須・茶器）', confidence: 80, basis: '急須の形状' },
    candExtras: [{ stamp: '', pattern: '', form: '' }], keywords: [], images: { surface: null, back: null }, stampSamples: [] }, over);
}
const cand = (maker, confidence, extra = {}) => Object.assign({ maker, confidence, origin: '有田焼', series: '', seriesConfidence: 0, product_name: '急須', pattern_name: '赤絵花文', patternConfidence: 60, basis: '赤絵・色絵の花文様、手描き', country: '日本', era: '', uncertainty: '' }, extra);

{ // 項目2: C003相当（40%に制限済みの候補＋窯元未確認）でも根拠があれば高額保留ラベル
  const seed = seedState({ candidates: [cand('源右衛門窯', 40)],
    facts: { surface: '赤絵の花文様、手描き', back: '[読取不可]', logo: '' },
    candExtras: [{ stamp: '', pattern: '赤絵・色絵の花文様', form: '急須' }],
    kilnCheck: { maker: '源右衛門窯', stampState: 'unreadable', stampLabel: '銘が不完全（読取不可・推測補完を含む）', stampOtherKilns: [], competitors: [], unverified: true, caution: true, priceBlock: true },
    priceStatus: { code: 'kiln_unverified', text: '窯元の確認が取れていないため、AI参考価格を表示していません' } });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  check('T2a 窯元未確認でも「高額候補の可能性あり・窯元要確認」が出る', band.includes('高額候補の可能性あり・窯元要確認'));
  check('T2b 金額は生成されない（価格不明のまま）', band.includes('価格不明') && !/[0-9,]+ 〜 [0-9,]+ 円/.test(band));
  check('T2c 根拠（有田の主要窯元・器種）が表示される', band.includes('有田の主要窯元の候補') && band.includes('急須'));
}
{ // 項目5: 無銘・根拠薄の一般的な皿 → 過剰警告しない
  const seed = seedState({ candidates: [cand('', 20, { origin: '', product_name: '小皿', pattern_name: '花柄', basis: '一般的な柄' })],
    itemType: { type: '皿・鉢', confidence: 70, basis: '' }, candExtras: [{ stamp: '', pattern: '', form: '' }] });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  check('T5a 無銘・低確信度では高額ラベルが出ない', !band.includes('高額候補の可能性あり') && band.includes('価格不明・要確認'));
}
{ // 有田窯元の候補だけ（特徴の根拠なし）→ 高額にしない
  const seed = seedState({ candidates: [cand('柿右衛門', 50, { pattern_name: '', patternConfidence: 0, product_name: '', basis: '' })],
    itemType: { type: '不明', confidence: 0, basis: '' }, candExtras: [{ stamp: '', pattern: '', form: '' }] });
  const p = await makePage(seed);
  check('T5b 窯元候補だけでは高額ラベルが出ない', !p.$('bandBox').textContent.includes('高額候補の可能性あり'));
}
{ // 項目6a: C001 フローラダニカ（価格不明・根拠あり）→ 従来ラベル維持
  const seed = seedState({ candidates: [cand('Royal Copenhagen', 90, { origin: '', series: 'フローラダニカ', seriesConfidence: 80, product_name: 'ポット', pattern_name: '植物画', basis: '手描きの植物画・金彩・学名の記載' })],
    itemType: { type: 'その他', confidence: 80, basis: 'ポット' },
    candExtras: [{ stamp: 'Royal Copenhagen', pattern: '金彩・手描き・学名（ラテン語）', form: 'ポット' }] });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  check('T6a C001相当: 従来の「高額候補の可能性あり・要確認」を維持', band.includes('高額候補の可能性あり・要確認') && !band.includes('窯元要確認'));
}
{ // 項目6b: C002 マイセン（価格不明・高額根拠なし）→ 従来どおり価格不明・要確認
  const seed = seedState({ candidates: [cand('Meissen（マイセン）', 80, { origin: '', product_name: 'カップ＆ソーサー', pattern_name: '波の戯れ', basis: '白磁の波状レリーフ' })],
    itemType: { type: 'カップ＆ソーサー', confidence: 80, basis: '' }, candExtras: [{ stamp: '', pattern: '白磁のレリーフ', form: '' }] });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  check('T6b C002相当: 高額ラベルは出ず「価格不明・要確認」のまま', !band.includes('高額候補の可能性あり') && band.includes('価格不明・要確認'));
}
{ // 項目1b: 40%上限時のまとめ表示に「窯元未確定」が明示される
  const seed = seedState({ candidates: [cand('源右衛門窯', 40)],
    facts: { surface: '赤絵の花文様', back: '[読取不可]', logo: '' },
    kilnGuard: { maker: '源右衛門窯', aiConfidence: 60, capped: 40, stampState: 'unreadable' },
    kilnCheck: { maker: '源右衛門窯', stampState: 'unreadable', stampLabel: '銘が不完全（読取不可・推測補完を含む）', stampOtherKilns: [], competitors: [], unverified: true, caution: true, priceBlock: true } });
  const p = await makePage(seed);
  p.$('btnShowResult').click();
  await wait(30);
  const res = p.$('result').innerHTML;
  check('T1d まとめ表示に「窯元未確定（取り違えに注意）」と40%制限が出る', res.includes('窯元未確定（取り違えに注意）') && res.includes('60%から40%に制限'));
}
{ // 項目7: 復元した保存データがそのまま保持される（起動で上書きしない）
  const seed = seedState({ candidates: [cand('源右衛門窯', 40)] });
  const p = await makePage(seed);
  check('T7 保存データは起動だけでは上書きされない', p.window.localStorage.getItem(WORK) === JSON.stringify(seed));
}

// ---- 最終レビュー対応: ロゴ欄の推測で確認済みにしない ----
{
  const p = await makePage(null); const g = gem(p.window);
  const seg = html.slice(html.indexOf('function kilnNameConfirmed'), html.indexOf('function computeKilnGuard'));
  check('R0 kilnNameConfirmed はロゴ欄の値（f.backstamp_logo）を参照しない', !seg.includes('f.backstamp_logo') && seg.includes('f.backstamp_text'));
  const r1 = aiData('源右衛門窯', 60, '[読取不可]', { logo: '源右衛門窯の銘と推測される形状' });
  check('R1 ロゴ欄に推測の窯元名があっても確認済みにしない', g.kilnNameConfirmed(r1) === false);
  check('R1b その場合も40%上限が発動する', (g.computeKilnGuard(r1) || {}).capped === 40);
  const r2 = aiData('柿右衛門', 70, '有田', { logo: '柿右衛門のロゴのような形状' });
  check('R2 転記に窯元名がなくロゴ欄だけにある場合も未確認（40%上限）', g.kilnNameConfirmed(r2) === false && (g.computeKilnGuard(r2) || {}).capped === 40);
  const r3 = aiData('香蘭社', 80, 'KORANSHA');
  check('R3 転記が英字銘（KORANSHA）なら確認済みになる（文字銘の副作用なし）', g.kilnNameConfirmed(r3) === true && g.computeKilnGuard(r3) === null);
}
// ---- 最終レビュー対応: 古陶磁器可能性ありでも3表示が一致 ----
{
  const seed = seedState({ candidates: [cand('源右衛門窯', 40)],
    facts: { surface: '赤絵の花文様、手描き', back: '[読取不可]', logo: '' },
    candExtras: [{ stamp: '', pattern: '赤絵・色絵の花文様', form: '急須' }],
    category: { type: '古陶磁器・骨董品の可能性', confidence: 50, basis: '銘が不完全' },
    risk: { flag: true, reasons: ['窯印が完全には読み取れておらず、現代窯元の候補（源右衛門窯）と古陶磁器の可能性が競合する'] },
    kilnGuard: { maker: '源右衛門窯', aiConfidence: 60, capped: 40, stampState: 'unreadable' },
    kilnCheck: { maker: '源右衛門窯', stampState: 'unreadable', stampLabel: '銘が不完全（読取不可・推測補完を含む）', stampOtherKilns: [], competitors: [], unverified: true, caution: true, priceBlock: true },
    priceStatus: { code: 'suppressed', text: 'アプリ側の安全チェックにより、価格を表示していません' } });
  const p = await makePage(seed);
  check('A1a 判定欄（renderBand）: 高額候補の可能性あり・窯元要確認', p.$('bandBox').textContent.includes('高額候補の可能性あり・窯元要確認'));
  p.$('btnShowResult').click();
  await wait(40);
  const res = p.$('result').innerHTML;
  check('A1b まとめ表示: 判定が判定欄と一致する', res.includes('判定: 高額候補の可能性あり・窯元要確認'));
  check('A1c まとめ表示: 固定の「判定: 価格不明・要確認」は出ない', !res.includes('判定: 価格不明・要確認'));
  const saved = JSON.parse(p.window.localStorage.getItem(WORK) || '{}');
  check('A1d コピー内容: 判定が一致する', (saved.lastSummary || '').includes('判定: 高額候補の可能性あり・窯元要確認'));
  check('A1e コピー内容: 高額の根拠も入る', (saved.lastSummary || '').includes('高額の根拠:'));
}
{
  const seed = seedState({ candidates: [cand('', 20, { origin: '', product_name: '小皿', pattern_name: '花柄', basis: '一般的な柄' })],
    category: { type: '古陶磁器・骨董品の可能性', confidence: 50, basis: '' },
    risk: { flag: true, reasons: ['AIの読み取り内容に古い技法・様式への言及（印判）がある'] },
    itemType: { type: '皿・鉢', confidence: 70, basis: '' }, candExtras: [{ stamp: '', pattern: '', form: '' }] });
  const p = await makePage(seed);
  p.$('btnShowResult').click();
  await wait(40);
  const saved = JSON.parse(p.window.localStorage.getItem(WORK) || '{}');
  check('A2 根拠がなければ古陶磁器でも3表示とも「価格不明・要確認」で一致', p.$('bandBox').textContent.includes('価格不明・要確認') && p.$('result').innerHTML.includes('判定: 価格不明・要確認') && (saved.lastSummary || '').includes('判定: 価格不明・要確認') && !p.$('result').innerHTML.includes('高額候補の可能性あり'));
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
