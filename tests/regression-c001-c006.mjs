// v2.3.16 回帰テスト C001〜C006（2026-11-22 新規）
// 目的: 商品ごとの期待結果（表示・安全判定・保存復元）がアプリ修正後も壊れていないかを確認する。
// 注意: これはアプリ側の表示・安全ロジックの回帰テストであり、写真認識（Gemini）の精度テストではない。API通信なし。
// テストデータの出典:
//   C001 実機記録（v2.3.15実施: 1回目は価格不明＋要確認、2回目はシリーズ正解＋AI参考150,000〜400,000円＋高額候補。v2.3.16試作でも正解3/3）
//   C002 実機はGoogle側503で有効結果0/3（未確認）。期待値は「価格未確定でも安全に表示する」ことに限定する
//   C003 実機記録（源右衛門窯と誤判定・確信度60%・価格不明）に対する C003対策後の期待動作
//   C004 実機記録2回分（1回目: 転記一致・90%・5,000〜15,000円／2回目: 1文字誤読・85%）に対する案A＋追加補修後の期待動作
//   C005 ユーザーの実機結果報告（2026-11-22 作業依頼文）: ノリタケ／サブライム、品番4403、AI参考価格5,000〜15,000円／1枚。数量2枚の推定は未確認（合否判定に使わない）
//   C006 ユーザーの実機結果報告（2026-11-22 作業依頼文）: ウェッジウッド／ユーランダー パウダーピンク、カップ＆ソーサー1客、AI参考価格8,000〜15,000円／1客、高額候補
// 対象: app/brand-search-v2316-c004-fix2.html（配信中の dev-v2316 と同一内容）
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const pick = (...us) => us.find(u => fs.existsSync(u)) || us[0]; // リポジトリ配置とローカル配置の両対応
const FILE = pick(new URL('../dev-v2316/index.html', import.meta.url), new URL('../app/brand-search-v2316-c004-fix2.html', import.meta.url));
const html = fs.readFileSync(FILE, 'utf8');
let pass = 0, fail = 0; const fails = [];
function check(name, cond){ if(cond){ pass++; console.log('PASS', name); } else { fail++; fails.push(name); console.log('FAIL', name); } }
const wait = ms => new Promise(r => setTimeout(r, ms));
const WORK = 'brand-search-v2316-test';

async function makePage(seed){
  const dom = new JSDOM(html, { url: 'https://example.com/', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w){ if(seed) w.localStorage.setItem(WORK, JSON.stringify(seed)); w.confirm = () => true; } });
  const { window } = dom;
  await wait(120);
  return { window, $: id => window.document.getElementById(id), doc: window.document };
}
const gem = w => w.__gemini;
function seedState(over){
  return Object.assign({ v: 2, facts: { surface: '', back: '', logo: '' }, candidates: [], priceRows: [], priceEstimate: null,
    material: { type: '陶磁器', confidence: 90, basis: '' }, valueAlert: { possible: false, reason: '' },
    category: { type: '現代のブランド食器', confidence: 80, basis: '' }, itemType: { type: 'カップ＆ソーサー', confidence: 80, basis: '' },
    candExtras: [{ stamp: '', pattern: '', form: '' }], keywords: [], images: { surface: null, back: null }, stampSamples: [] }, over);
}
const cand = (maker, confidence, extra = {}) => Object.assign({ maker, confidence, origin: '', series: '', seriesConfidence: 0, product_name: '', pattern_name: '', patternConfidence: 0, basis: '', country: '', era: '', uncertainty: '' }, extra);
function aiData(maker, conf, stamp, extra = {}){
  return { material: '陶磁器', category: '現代のブランド食器',
    observed_facts: { surface: [], backstamp_text: stamp, backstamp_logo: extra.logo || '', shape_and_size_notes: [] },
    identification_candidates: [{ maker, origin: extra.origin || '', series: extra.series || null, pattern_name: extra.pattern || null, pattern_confidence: 60, product_name: extra.product || '', country: extra.country || '', era_estimate: '現代', basis: [], contradicting_evidence: [], brand_confidence: conf, series_confidence: extra.seriesConf || 0, uncertainty: '', stamp_evidence: '', pattern_evidence: extra.patternEv || '', form_evidence: '' }],
    unreadable_or_uncertain: [], value_alert: { possible: false, reason: '' }, price_band_estimate: null };
}

// ===== C001 ロイヤルコペンハーゲン／フローラダニカ（ポット） =====
{
  const p = await makePage(null); const g = gem(p.window);
  const d = aiData('Royal Copenhagen', 90, 'Royal Copenhagen Denmark', { series: 'フローラダニカ', seriesConf: 80, product: 'ポット', patternEv: '手描きの植物画・学名の記載' });
  check('[C001] 西洋ブランドは窯元検証の対象外（価格を誤って止めない）', g.assessKilnVerification(d) === null && g.aiPriceKilnBlocked(g.assessKilnVerification(d)) === false);
}
{ // 価格あり版（実機2回目相当）: 価格表示と高額候補を維持
  const seed = seedState({ candidates: [cand('Royal Copenhagen', 90, { series: 'フローラダニカ', seriesConfidence: 80, product_name: 'ポット', pattern_name: '植物画', basis: '手描きの植物画・金彩・学名の記載' })],
    itemType: { type: 'その他', confidence: 80, basis: 'ポット' },
    candExtras: [{ stamp: 'Royal Copenhagen', pattern: '金彩・手描き・学名（ラテン語）', form: 'ポット' }],
    priceEstimate: { low: 150000, high: 400000, note: '', unit: '1点あたり', perItem: true, count: null, countNote: '' },
    priceStatus: { code: 'shown', text: '' } });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  p.$('btnShowResult').click(); await wait(40);
  check('[C001] 価格あり: AI参考価格 150,000 〜 400,000 円が表示される', band.includes('150,000 〜 400,000 円'));
  check('[C001] 価格あり: 判定は「高額候補」', band.includes('高額候補'));
  check('[C001] 結果表示にブランドとシリーズ（フローラダニカ）が出る', p.$('result').textContent.includes('Royal Copenhagen') && p.$('result').textContent.includes('フローラダニカ'));
}
{ // 価格不明版（実機1回目相当）: 金額は作らず、高額候補の可能性だけを保持
  const seed = seedState({ candidates: [cand('Royal Copenhagen', 90, { series: 'フローラダニカ', seriesConfidence: 80, product_name: 'ポット', pattern_name: '植物画', basis: '手描きの植物画・金彩・学名の記載' })],
    facts: { surface: '手描きの植物画、金彩の縁取り', back: 'Royal Copenhagen', logo: '王冠のマーク' },
    itemType: { type: 'その他', confidence: 80, basis: 'ポット' },
    candExtras: [{ stamp: 'Royal Copenhagen', pattern: '金彩・手描き・学名（ラテン語）', form: 'ポット' }],
    valueAlert: { possible: true, reason: 'フローラダニカの特徴と一致' },
    priceEstimate: null, priceStatus: { code: 'ai_no_estimate', text: '' } });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  check('[C001] 価格不明: 金額は表示されず「価格不明」になる', band.includes('価格不明') && !band.includes('150,000'));
  check('[C001] 価格不明: 「高額候補の可能性あり・要確認」を保持する', band.includes('高額候補の可能性あり・要確認'));
}

// ===== C002 マイセン／波の戯れ =====
// 実機の認識結果は503のため未確認。ここでは表示ロジック（シリーズ表示の条件と安全表示）だけを確認する。
{
  const seed = seedState({ candidates: [cand('Meissen（マイセン）', 80, { series: '波の戯れ', seriesConfidence: 70, product_name: 'カップ＆ソーサー', pattern_name: '波の戯れ', basis: '白磁の波状レリーフ' })],
    candExtras: [{ stamp: '', pattern: '白磁のレリーフ', form: '' }] });
  const p = await makePage(seed);
  p.$('btnShowResult').click(); await wait(40);
  check('[C002] シリーズ確信度が十分なら結果表示にシリーズ名（波の戯れ）が出る', p.$('result').textContent.includes('波の戯れ'));
  check('[C002] 価格未確定でも安全表示（価格不明・要確認）で、根拠のない高額候補は出ない', p.$('bandBox').textContent.includes('価格不明・要確認') && !p.$('bandBox').textContent.includes('高額候補の可能性あり'));
}
{
  const seed = seedState({ candidates: [cand('Meissen（マイセン）', 80, { series: '波の戯れ', seriesConfidence: 30, product_name: 'カップ＆ソーサー', basis: '白磁の波状レリーフ' })],
    candExtras: [{ stamp: '', pattern: '白磁のレリーフ', form: '' }] });
  const p = await makePage(seed);
  p.$('btnShowResult').click(); await wait(40);
  check('[C002] シリーズ確信度が低い場合は断定せず「未確認」側に倒す', p.$('result').textContent.includes('未確認'));
}

// ===== C003 柿右衛門系の急須（バックスタンプ読取不可） =====
{
  const p = await makePage(null); const g = gem(p.window);
  const d = aiData('源右衛門窯', 60, '[読取不可]', { origin: '有田焼', product: '急須' });
  const kc = g.assessKilnVerification(d);
  check('[C003] 読取不可は unreadable で窯元未確定になる', !!kc && kc.stampState === 'unreadable' && kc.unverified === true);
  check('[C003] AIが源右衛門窯と推測しても確信度は40%に制限される', (g.computeKilnGuard(d) || {}).capped === 40);
  check('[C003] AI参考価格は抑止される', g.aiPriceKilnBlocked(kc) === true);
}
{
  const seed = seedState({ candidates: [cand('源右衛門窯', 40, { origin: '有田焼', product_name: '急須' })],
    facts: { surface: '赤絵の花文様、手描き', back: '[読取不可]', logo: '' },
    itemType: { type: 'その他（急須・茶器）', confidence: 80, basis: '急須の形状' },
    candExtras: [{ stamp: '', pattern: '赤絵・色絵の花文様', form: '急須' }],
    kilnCheck: { maker: '源右衛門窯', stampState: 'unreadable', stampLabel: '銘が不完全（読取不可・推測補完を含む）', stampOtherKilns: [], competitors: [], unverified: true, caution: true, priceBlock: true },
    priceStatus: { code: 'kiln_unverified', text: '窯元の確認が取れていないため、AI参考価格を表示していません' } });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  check('[C003] 画面: 価格不明＋「高額候補の可能性あり・窯元要確認」を保持する', band.includes('価格不明') && band.includes('高額候補の可能性あり・窯元要確認'));
}

// ===== C004 源右衛門窯のカップ＆ソーサー =====
{
  const p = await makePage(null); const g = gem(p.window);
  const ok = aiData('源右衛門窯', 90, '源右衛門', { origin: '有田焼', product: '両手付カップ＆ソーサー' });
  check('[C004] 転記「源右衛門」: read で制限なし・価格を止めない', g.assessKilnVerification(ok).stampState === 'read' && g.computeKilnGuard(ok) === null && g.aiPriceKilnBlocked(g.assessKilnVerification(ok)) === false);
  const ng = aiData('源右衛門窯', 85, '源右工門', { origin: '有田焼', product: '両手付カップ＆ソーサー', logo: '源右衛門窯の銘と推測される' });
  const kc = g.assessKilnVerification(ng);
  check('[C004] 転記「源右工門」: mismatch で確信度40%制限・AI価格を保留', kc.stampState === 'mismatch' && (g.computeKilnGuard(ng) || {}).capped === 40 && g.aiPriceKilnBlocked(kc) === true);
}
{
  const seed = seedState({ candidates: [cand('源右衛門窯', 90, { origin: '有田焼', product_name: '両手付カップ＆ソーサー' })],
    facts: { surface: '染錦で牡丹を描く。金彩の縁取り', back: '源右衛門', logo: '' },
    kilnCheck: { maker: '源右衛門窯', stampState: 'read', stampLabel: '転記に窯元名あり（一致だけでは確定しない）', stampOtherKilns: [], competitors: [], unverified: false, caution: false, priceBlock: false },
    priceEstimate: { low: 5000, high: 15000, note: '', unit: '1客あたり', perItem: true, count: null, countNote: '' },
    priceStatus: { code: 'shown', text: '' } });
  const p = await makePage(seed);
  check('[C004] 転記一致の保存結果: AI参考価格 5,000 〜 15,000 円が通常表示される', p.$('bandBox').textContent.includes('5,000 〜 15,000 円'));
}

// ===== C005 ノリタケ／サブライム（SUBLIME）品番4403 =====
// 出典: ユーザーの実機結果報告（2026-11-22）。数量2枚の推定は未確認のため合否判定に使わない。
{
  const p = await makePage(null); const g = gem(p.window);
  const d = aiData('ノリタケ', 85, 'NORITAKE', { series: 'サブライム', seriesConf: 75, product: 'プレート 4403' });
  check('[C005] ノリタケは有田窯元の検証対象外（価格を誤って止めない）', g.assessKilnVerification(d) === null);
}
{
  const seed = seedState({ candidates: [cand('ノリタケ', 85, { series: 'サブライム', seriesConfidence: 75, product_name: 'プレート（品番4403）', pattern_name: 'サブライム', basis: 'バックスタンプに SUBLIME 4403 の表記' })],
    itemType: { type: '皿・鉢', confidence: 80, basis: 'プレート' },
    candExtras: [{ stamp: 'NORITAKE SUBLIME 4403', pattern: '', form: 'プレート' }],
    priceEstimate: { low: 5000, high: 15000, note: 'AI参考推定（未検証）', unit: '1枚あたり', perItem: true, count: 2, countNote: '数量要確認' },
    priceStatus: { code: 'shown', text: '' } });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  p.$('btnShowResult').click(); await wait(40);
  check('[C005] AI参考価格 5,000 〜 15,000 円が表示される', band.includes('5,000 〜 15,000 円'));
  check('[C005] 単位は「1枚あたり」と表示される', band.includes('1枚あたり'));
  check('[C005] 結果表示に品番4403とシリーズ（サブライム）が出る', p.$('result').textContent.includes('4403') && p.$('result').textContent.includes('サブライム'));
}

// ===== C006 ウェッジウッド／ユーランダー パウダーピンク =====
// 出典: ユーザーの実機結果報告（2026-11-22）。
{
  const seed = seedState({ candidates: [cand('ウェッジウッド', 85, { series: 'ユーランダー パウダーピンク', seriesConfidence: 75, product_name: 'カップ＆ソーサー', pattern_name: 'ユーランダー', basis: 'ピンクの花文様、バックスタンプに Wedgwood の表記' })],
    itemType: { type: 'カップ＆ソーサー', confidence: 85, basis: '持ち手のあるカップと受け皿' },
    candExtras: [{ stamp: 'Wedgwood', pattern: 'ピンクの花文様', form: 'カップ＆ソーサー' }],
    priceEstimate: { low: 8000, high: 15000, note: 'AI参考推定（未検証）', unit: '1客あたり', perItem: true, count: null, countNote: '' },
    priceStatus: { code: 'shown', text: '' } });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  p.$('btnShowResult').click(); await wait(40);
  check('[C006] AI参考価格 8,000 〜 15,000 円が表示される', band.includes('8,000 〜 15,000 円'));
  check('[C006] 単位は「1客あたり」で、判定は「高額候補」', band.includes('1客あたり') && band.includes('高額候補'));
  check('[C006] 結果表示にブランドとシリーズ（ユーランダー パウダーピンク）が出る', p.$('result').textContent.includes('ウェッジウッド') && p.$('result').textContent.includes('ユーランダー'));
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
if(fails.length) console.log('FAILED:', fails.join(' / '));
process.exit(fail ? 1 : 0);
