// v2.3.16 C004価格抑止（案A）検証: API通信なしの模擬テスト
// 対象: app/brand-search-v2316-c004-fix.html（fix2＋案A: mismatchでもAI参考価格を抑止、手入力成約価格は維持＋注意）
// 項目: 1) C004 1回目（read）は従来どおり 2) C004 2回目（mismatch）は40%制限＋AI価格非表示＋3表示一致
//       3) C003（unreadable）の保留警告を維持 4) 手入力成約価格は抑止せず注意を表示
//       5) C001・C002（西洋）は不変 6) 保存キー・保存項目・GEN_CONFIGが不変
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const pick = (...us) => us.find(u => fs.existsSync(u)) || us[0]; // リポジトリ配置とローカル配置の両対応
const NEW = pick(new URL('./fixtures/brand-search-v2316-c004-fix.html', import.meta.url), new URL('../app/brand-search-v2316-c004-fix.html', import.meta.url));
const OLD = pick(new URL('./fixtures/brand-search-v2316-c003-fix2.html', import.meta.url), new URL('../app/brand-search-v2316-c003-fix2.html', import.meta.url));
const html = fs.readFileSync(NEW, 'utf8');
const old = fs.readFileSync(OLD, 'utf8');
let pass = 0, fail = 0;
function check(name, cond){ if(cond){ pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); } }
const wait = ms => new Promise(r => setTimeout(r, ms));
const WORK = 'brand-search-v2316-test';

// ---- ソース確認 ----
check('S1 保存キーが不変', html.includes("const STORE_KEY = 'brand-search-v2316-test'") && html.includes("const HISTORY_STORE_KEY = 'brand-search-history-v2316-test'") && html.includes("const IDB_NAME = 'shokki-brand-search-v2316-test'") && html.includes("const APP_ID = 'shokki-brand-search-v2316-test'"));
check('S2 GEN_CONFIGブロックがfix2と同一', html.slice(html.indexOf('const GEN_CONFIG'), html.indexOf('};', html.indexOf('const GEN_CONFIG'))) === old.slice(old.indexOf('const GEN_CONFIG'), old.indexOf('};', old.indexOf('const GEN_CONFIG'))));
check('S3 runGeminiの価格抑止が aiPriceKilnBlocked を使う', html.includes('const kilnBlock = aiPriceKilnBlocked(kilnCheck);'));
check('S4 priceEstimate の条件式は従来形（!kilnBlock）を維持', html.includes('priceEstimate = (!antiquePossible() && peValid && !kilnBlock)'));
check('S5 collectStateの保存項目が不変', ['kilnGuard, kilnCaution, kilnCheck, priceStatus: lastPriceStatus, candExtras: lastCandidateExtras'].every(t => html.includes(t)));
check('S6 assessKilnVerification の priceBlock 定義は不変（既存動作を維持）', html.includes("priceBlock: stampState === 'unreadable' || stampState === 'empty' || stampState === 'contradiction'"));

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
    observed_facts: { surface: ['染錦の牡丹文'], backstamp_text: stamp, backstamp_logo: '', shape_and_size_notes: [] },
    identification_candidates: [{ maker, origin: '有田焼', series: null, pattern_name: extra.pattern || '染錦牡丹文', pattern_confidence: 60, product_name: extra.product || '両手付カップ＆ソーサー', country: '日本', era_estimate: '現代', basis: ['絵柄'], contradicting_evidence: [], brand_confidence: conf, series_confidence: 0, uncertainty: '', stamp_evidence: '', pattern_evidence: '染錦・色絵', form_evidence: extra.form || '両手付カップ' }],
    unreadable_or_uncertain: [], value_alert: { possible: false, reason: '' }, price_band_estimate: null };
}
// runGemini の価格決定（該当箇所）の模擬: ソース確認S3/S4と組み合わせて配線を担保する
function decidePrice(g, data, pe){
  const kc = g.assessKilnVerification(data);
  const blocked = g.aiPriceKilnBlocked(kc);
  const peValid = !!(pe && Number(pe.low) > 0 && Number(pe.high) >= Number(pe.low));
  return { kc, blocked, estimate: (!blocked && peValid) ? { low: pe.low, high: pe.high } : null,
           status: (blocked && peValid) ? 'kiln_unverified' : (peValid ? 'shown' : 'none') };
}

// ---- 単位テスト ----
{
  const p = await makePage(null); const g = gem(p.window);
  check('U0 aiPriceKilnBlocked が公開されている', typeof g.aiPriceKilnBlocked === 'function');

  const r1 = decidePrice(g, aiData('源右衛門窯', 90, '源右衛門'), { low: 5000, high: 15000 });
  check('U1 C004 1回目（read）: 抑止されずAI価格が通る', r1.kc.stampState === 'read' && r1.blocked === false && !!r1.estimate && r1.status === 'shown');
  check('U1b C004 1回目: ガード非発動・確信度90%のまま', g.computeKilnGuard(aiData('源右衛門窯', 90, '源右衛門')) === null);

  const d2 = aiData('源右衛門窯', 85, '源右工門');
  const r2 = decidePrice(g, d2, { low: 10000, high: 25000 });
  check('U2a C004 2回目: 状態は mismatch で従来の priceBlock は false', r2.kc.stampState === 'mismatch' && r2.kc.priceBlock === false);
  check('U2b C004 2回目: 案Aでは抑止される（estimate=null・状態 kiln_unverified）', r2.blocked === true && r2.estimate === null && r2.status === 'kiln_unverified');
  check('U2c C004 2回目: 40%制限は維持（85→40）', (g.computeKilnGuard(d2) || {}).capped === 40 && g.kilnNameConfirmed(d2) === false);

  check('U3 unreadable は従来どおり抑止', decidePrice(g, aiData('源右衛門窯', 60, '[読取不可]'), { low: 5000, high: 9000 }).estimate === null);
  check('U4 empty（転記なし）は従来どおり抑止', decidePrice(g, aiData('源右衛門窯', 60, ''), { low: 5000, high: 9000 }).estimate === null);
  check('U5 contradiction（別窯元名）は従来どおり抑止', decidePrice(g, aiData('源右衛門窯', 60, '柿右衛門'), { low: 5000, high: 9000 }).estimate === null);

  const rc = aiData('Royal Copenhagen', 90, 'Royal Copenhagen Denmark', { product: 'ポット' });
  const ms = aiData('Meissen（マイセン）', 80, 'Meissen', { product: 'カップ＆ソーサー' });
  check('U6 C001/C002相当（西洋）: 窯元検証は対象外でAI価格は抑止されない', g.assessKilnVerification(rc) === null && g.assessKilnVerification(ms) === null && decidePrice(g, rc, { low: 100000, high: 200000 }).blocked === false && !!decidePrice(g, ms, { low: 20000, high: 40000 }).estimate);
}

// ---- 画面表示テスト ----
function seedState(over){
  return Object.assign({ v: 2, facts: { surface: '', back: '', logo: '' }, candidates: [], priceRows: [], priceEstimate: null,
    material: { type: '陶磁器', confidence: 90, basis: '' }, valueAlert: { possible: false, reason: '' },
    category: { type: '現代のブランド食器', confidence: 80, basis: '' }, itemType: { type: 'カップ＆ソーサー', confidence: 80, basis: '両手付カップ' },
    candExtras: [{ stamp: '', pattern: '', form: '' }], keywords: [], images: { surface: null, back: null }, stampSamples: [] }, over);
}
const cand = (maker, confidence, extra = {}) => Object.assign({ maker, confidence, origin: '有田焼', series: '', seriesConfidence: 0, product_name: '両手付カップ＆ソーサー', pattern_name: '染錦牡丹文', patternConfidence: 60, basis: '染錦・色絵の牡丹文、金彩', country: '日本', era: '', uncertainty: '' }, extra);
const KC_MISMATCH = { maker: '源右衛門窯', stampState: 'mismatch', stampLabel: '転記に第一候補の窯元名が含まれない', stampOtherKilns: [], competitors: [], unverified: true, caution: true, priceBlock: false };
const KC_READ = { maker: '源右衛門窯', stampState: 'read', stampLabel: '転記に窯元名あり（一致だけでは確定しない）', stampOtherKilns: [], competitors: [], unverified: false, caution: false, priceBlock: false };

{ // C004 2回目の表示: AI価格非表示・保留警告・3表示一致
  const seed = seedState({ candidates: [cand('源右衛門窯', 40)],
    facts: { surface: '染錦で牡丹を描く。金彩の縁取り', back: '源右工門', logo: '' },
    candExtras: [{ stamp: '', pattern: '染錦・色絵の牡丹文', form: '両手付カップ' }],
    kilnGuard: { maker: '源右衛門窯', aiConfidence: 85, capped: 40, stampState: 'mismatch' },
    kilnCheck: KC_MISMATCH,
    priceStatus: { code: 'kiln_unverified', text: '窯元の確認が取れていないため、AI参考価格を表示していません（転記に第一候補の窯元名が含まれない）' } });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  check('V1a 判定欄: 価格不明＋「高額候補の可能性あり・窯元要確認」', band.includes('価格不明') && band.includes('高額候補の可能性あり・窯元要確認'));
  check('V1b 判定欄: AI価格の金額は出ない', !/[0-9,]+ 〜 [0-9,]+ 円/.test(band));
  check('V1c 判定欄の詳細: 抑止理由（窯元未確認）が表示される', band.includes('窯元の確認が取れていないため、AI参考価格を表示していません'));
  check('V1c2 価格欄は検索直後に理由文（lastPriceStatus.text）を出す実装のまま', html.includes("(lastPriceStatus && lastPriceStatus.code !== 'shown') ? '価格不明・要確認: ' + lastPriceStatus.text"));
  p.$('btnShowResult').click();
  await wait(40);
  const res = p.$('result').innerHTML;
  check('V1d まとめ表示: 判定が一致し、窯元未確定（85%から40%に制限）が出る', res.includes('判定: 高額候補の可能性あり・窯元要確認') && res.includes('窯元未確定（取り違えに注意）') && res.includes('85%から40%に制限'));
  check('V1e まとめ表示: 窯元確認欄が「AI参考価格は表示していません」になる', res.includes('AI参考価格は、窯元の確認が取れていないため表示していません'));
  const saved = JSON.parse(p.window.localStorage.getItem(WORK) || '{}');
  check('V1f コピー内容: 判定が一致し、AI価格非表示の注記が入る', (saved.lastSummary || '').includes('判定: 高額候補の可能性あり・窯元要確認') && (saved.lastSummary || '').includes('AI参考価格は窯元未確認のため表示していません'));
}
{ // C004 2回目・根拠が薄い場合: 価格不明・要確認で一致
  const seed = seedState({ candidates: [cand('源右衛門窯', 40, { pattern_name: '', patternConfidence: 0, basis: '' })],
    facts: { surface: '青い文様', back: '源右工門', logo: '' },
    candExtras: [{ stamp: '', pattern: '', form: '' }], kilnCheck: KC_MISMATCH,
    priceStatus: { code: 'kiln_unverified', text: '窯元の確認が取れていないため、AI参考価格を表示していません（転記に第一候補の窯元名が含まれない）' } });
  const p = await makePage(seed);
  p.$('btnShowResult').click();
  await wait(40);
  const saved = JSON.parse(p.window.localStorage.getItem(WORK) || '{}');
  check('V2 根拠が薄ければ3表示とも「価格不明・要確認」で一致', p.$('bandBox').textContent.includes('価格不明・要確認') && p.$('result').innerHTML.includes('判定: 価格不明・要確認') && (saved.lastSummary || '').includes('判定: 価格不明・要確認') && !p.$('bandBox').textContent.includes('高額候補の可能性あり'));
}
{ // C004 1回目の表示: 従来どおりAI価格と高額候補
  const seed = seedState({ candidates: [cand('源右衛門窯', 90)],
    facts: { surface: '染錦で牡丹を描く', back: '源右衛門', logo: '' },
    kilnCheck: KC_READ, priceEstimate: { low: 5000, high: 15000, note: '', unit: '1客あたり', perItem: true, count: null, countNote: '' },
    priceStatus: { code: 'shown', text: '' } });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  check('V3a 判定欄: AI参考価格 5,000 〜 15,000 円＋高額候補', band.includes('5,000 〜 15,000 円') && band.includes('高額候補') && band.includes('AI参考推定'));
  check('V3b 価格欄: AI参考価格が表示される', p.$('priceEstBox').textContent.includes('5,000 〜 15,000 円'));
  check('V3c 窯元未確認の注意は出ない', !band.includes('対応を確認してください'));
}
{ // 手入力の成約価格: mismatchでも抑止せず、対応確認の注意を3表示に出す
  const seed = seedState({ candidates: [cand('源右衛門窯', 40)],
    facts: { surface: '染錦で牡丹を描く。金彩の縁取り', back: '源右工門', logo: '' },
    candExtras: [{ stamp: '', pattern: '染錦・色絵の牡丹文', form: '両手付カップ' }],
    kilnCheck: KC_MISMATCH,
    priceRows: [{ price: 12000, source: 'メルカリ', note: '' }, { price: 15000, source: 'ヤフオク', note: '' }],
    priceStatus: { code: 'kiln_unverified', text: '窯元の確認が取れていないため、AI参考価格を表示していません（転記に第一候補の窯元名が含まれない）' } });
  const p = await makePage(seed);
  const band = p.$('bandBox').textContent;
  check('V4a 判定欄: 実績ベース 10,800 〜 16,200 円が表示される（AI価格とは別）', band.includes('10,800 〜 16,200 円') && band.includes('実績ベース'));
  check('V4b 判定欄: 対応確認の注意が出る', band.includes('窯元未確認のため、この成約価格がこの商品のものか、対応を確認してください'));
  p.$('btnShowResult').click();
  await wait(40);
  check('V4c まとめ表示: 実績価格と注意が出る', p.$('result').innerHTML.includes('10,800 〜 16,200 円') && p.$('result').innerHTML.includes('対応を確認してください'));
  const saved = JSON.parse(p.window.localStorage.getItem(WORK) || '{}');
  check('V4d コピー内容: 実績価格と注意が出る', (saved.lastSummary || '').includes('10,800〜16,200円') && (saved.lastSummary || '').includes('注意: 窯元未確認のため、この成約価格がこの商品のものか、対応を確認してください'));
}
{ // 手入力＋read: 注意は出ない
  const seed = seedState({ candidates: [cand('源右衛門窯', 90)],
    facts: { surface: '染錦で牡丹を描く', back: '源右衛門', logo: '' },
    kilnCheck: KC_READ, priceRows: [{ price: 12000, source: 'メルカリ', note: '' }, { price: 15000, source: 'ヤフオク', note: '' }] });
  const p = await makePage(seed);
  check('V5 read＋手入力: 実績ベース表示で注意は出ない', p.$('bandBox').textContent.includes('実績ベース') && !p.$('bandBox').textContent.includes('対応を確認してください'));
}
{ // C003回帰: unreadableでも保留警告を維持
  const seed = seedState({ candidates: [cand('源右衛門窯', 40, { product_name: '急須' })],
    facts: { surface: '赤絵の花文様、手描き', back: '[読取不可]', logo: '' },
    itemType: { type: 'その他（急須・茶器）', confidence: 80, basis: '急須の形状' },
    candExtras: [{ stamp: '', pattern: '赤絵・色絵の花文様', form: '急須' }],
    kilnCheck: { maker: '源右衛門窯', stampState: 'unreadable', stampLabel: '銘が不完全（読取不可・推測補完を含む）', stampOtherKilns: [], competitors: [], unverified: true, caution: true, priceBlock: true },
    priceStatus: { code: 'kiln_unverified', text: '窯元の確認が取れていないため、AI参考価格を表示していません' } });
  const p = await makePage(seed);
  check('V6 C003回帰: 価格不明＋「高額候補の可能性あり・窯元要確認」を維持', p.$('bandBox').textContent.includes('価格不明') && p.$('bandBox').textContent.includes('高額候補の可能性あり・窯元要確認'));
}
{ // C001/C002回帰（価格不明時のラベル）
  const seed = seedState({ candidates: [cand('Royal Copenhagen', 90, { origin: '', series: 'フローラダニカ', seriesConfidence: 80, product_name: 'ポット', pattern_name: '植物画', basis: '手描きの植物画・金彩・学名の記載' })],
    itemType: { type: 'その他', confidence: 80, basis: 'ポット' },
    candExtras: [{ stamp: 'Royal Copenhagen', pattern: '金彩・手描き・学名（ラテン語）', form: 'ポット' }] });
  const p = await makePage(seed);
  check('V7a C001回帰: 「高額候補の可能性あり・要確認」を維持（窯元要確認は付かない）', p.$('bandBox').textContent.includes('高額候補の可能性あり・要確認') && !p.$('bandBox').textContent.includes('窯元要確認'));
  const seed2 = seedState({ candidates: [cand('Meissen（マイセン）', 80, { origin: '', product_name: 'カップ＆ソーサー', pattern_name: '波の戯れ', basis: '白磁の波状レリーフ' })],
    candExtras: [{ stamp: '', pattern: '白磁のレリーフ', form: '' }] });
  const p2 = await makePage(seed2);
  check('V7b C002回帰: 「価格不明・要確認」のまま', p2.$('bandBox').textContent.includes('価格不明・要確認') && !p2.$('bandBox').textContent.includes('高額候補の可能性あり'));
}
{ // 保存データは起動だけでは上書きされない
  const seed = seedState({ candidates: [cand('源右衛門窯', 40)], kilnCheck: KC_MISMATCH });
  const p = await makePage(seed);
  check('V8 保存データは起動だけでは上書きされない', p.window.localStorage.getItem(WORK) === JSON.stringify(seed));
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
