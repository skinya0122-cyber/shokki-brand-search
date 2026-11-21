// 食器AIブランドサーチ 自動回帰テスト ランナー（2026-11-22）
// 使い方: npm run test:brand
// 実行するテストはすべて API通信なし・実データ不使用（jsdom 上の模擬データのみ）。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const FILES = [
  { file: 'verify-brand2316-c003-fix2.mjs', label: 'C003対策（窯元ガード二段化・高額見逃し防止）' },
  { file: 'verify-brand2316-c004.mjs', label: 'C004 案A（価格抑止の統一）' },
  { file: 'verify-brand2316-c004-fix2.mjs', label: 'C004 追加補修（判定統一・復元時再評価）' },
  { file: 'verify-brand2316-c004-final.mjs', label: 'C004 最終再現テスト（画面表示まで）' },
  { file: 'regression-c001-c006.mjs', label: 'C001〜C006 商品別回帰テスト' },
];

const results = [];
let allLines = [];
for(const { file, label } of FILES){
  const r = spawnSync(process.execPath, [path.join(root, file)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.split('\n').filter(l => /^(PASS|FAIL) /.test(l));
  const m = out.match(/=== (\d+) passed, (\d+) failed ===/);
  const passed = m ? Number(m[1]) : lines.filter(l => l.startsWith('PASS')).length;
  const failed = m ? Number(m[2]) : lines.filter(l => l.startsWith('FAIL')).length;
  results.push({ file, label, passed, failed, lines, exit: r.status });
  allLines = allLines.concat(lines.map(l => ({ file, line: l })));
  console.log(`--- ${label}（${file}）: ${passed} passed, ${failed} failed`);
}

const totalPass = results.reduce((a, r) => a + r.passed, 0);
const totalFail = results.reduce((a, r) => a + r.failed, 0);

// 商品別 C001〜C006（regression-c001-c006.mjs の [C00n] 行から集計）
const cases = {};
for(const c of ['C001','C002','C003','C004','C005','C006']){
  const ls = allLines.filter(x => x.line.includes(`[${c}]`));
  cases[c] = { pass: ls.filter(x => x.line.startsWith('PASS')).length, fail: ls.filter(x => x.line.startsWith('FAIL')).length };
}
// 安全機能（窯元ガード・価格抑止・保留・制限などに触れる項目）
const safetyKeys = /制限|抑止|保留|窯元|mismatch|unreadable|対象外|価格不明|未確認/;
const safety = allLines.filter(x => safetyKeys.test(x.line));
// 保存・復元
const saveKeys = /復元|保存|履歴|コピー|再読み込み|バックアップ|起動だけ/;
const saveRestore = allLines.filter(x => saveKeys.test(x.line));
const failures = allLines.filter(x => x.line.startsWith('FAIL'));

const UNCONFIRMED = [
  'iPhone実機・実際のGemini APIでの動作確認は未実施（このテストは表示・安全ロジックの回帰確認であり、写真認識の精度を示すものではない）',
  'C002 マイセン「波の戯れ」: 実機の認識結果はGoogle側503のため未取得（有効結果0/3）。回帰テストは表示ロジックのみを対象とする',
  'C005 ノリタケ／サブライム: 数量2枚という推定は未確認（合否判定には使っていない）',
  'C001 の価格帯 150,000〜400,000円はAI参考推定（未検証）であり、成約相場ではない',
  'C005・C006 の価格帯はユーザーの実機結果報告（2026-11-22）に基づくAI参考推定（未検証）',
  '転記に誤った窯元名が自信を持って書かれた場合は検出できない（既知の限界）',
];

const now = new Date();
const stamp = now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
const md = [];
md.push('# 食器AIブランドサーチ 自動回帰テスト レポート');
md.push('');
md.push(`実行日時: ${stamp}（Asia/Tokyo）`);
md.push('対象: app/brand-search-v2316-c004-fix2.html（試作版 v2.3.16／配信中の dev-v2316 と同一内容）');
md.push('方法: jsdom 上で実際のHTMLを動かす模擬テスト。Gemini API通信なし、実際の査定履歴へのアクセスなし。');
md.push('');
md.push(`## 合計: ${totalPass + totalFail}件（合格 ${totalPass}／不合格 ${totalFail}）`);
md.push('');
md.push('## ファイル別');
for(const r of results) md.push(`- ${r.label}（${r.file}）: ${r.passed} passed, ${r.failed} failed`);
md.push('');
md.push('## 商品別 C001〜C006');
for(const c of Object.keys(cases)) md.push(`- ${c}: 合格 ${cases[c].pass}／不合格 ${cases[c].fail}`);
md.push('');
md.push(`## 安全機能: 合格 ${safety.filter(x => x.line.startsWith('PASS')).length}／不合格 ${safety.filter(x => x.line.startsWith('FAIL')).length}（該当 ${safety.length}件）`);
md.push(`## 保存・復元: 合格 ${saveRestore.filter(x => x.line.startsWith('PASS')).length}／不合格 ${saveRestore.filter(x => x.line.startsWith('FAIL')).length}（該当 ${saveRestore.length}件）`);
md.push('');
md.push('## 未確認項目');
for(const u of UNCONFIRMED) md.push(`- ${u}`);
md.push('');
md.push('## 失敗箇所と原因');
if(failures.length === 0) md.push('- なし（全件合格）');
else for(const f of failures) md.push(`- [${f.file}] ${f.line.replace(/^FAIL /, '')}（原因は該当テストの出力と対象コードを確認のこと）`);
md.push('');

const reportDir = path.join(root, 'reports');
fs.mkdirSync(reportDir, { recursive: true });
const fileStamp = now.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(/[: ]/g, '-').slice(0, 16);
const reportPath = path.join(reportDir, `report-${fileStamp}.md`);
fs.writeFileSync(reportPath, md.join('\n'));
fs.writeFileSync(path.join(reportDir, 'latest-report.md'), md.join('\n'));

console.log('');
console.log(`=== 合計 ${totalPass + totalFail}件: ${totalPass} passed, ${totalFail} failed ===`);
console.log('商品別:', Object.entries(cases).map(([c, v]) => `${c} ${v.pass}/${v.pass + v.fail}`).join(' / '));
console.log(`レポート: ${path.relative(process.cwd(), reportPath)}`);
process.exit(totalFail ? 1 : 0);
