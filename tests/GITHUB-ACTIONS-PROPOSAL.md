# GitHub Actions 導入案（提示のみ・未有効化）

作成: 2026-11-22
状態: **案の提示まで。ワークフローファイルは作成していない。**

## 前提と課題

- 自動テスト一式（tests/ 配下、package.json）は現在ローカル作業環境 `~/workspace/shokki-ai-satei/` にある。
- GitHub Pages のリポジトリ `skinya0122-cyber/shokki-brand-search` にはサイト本体（index.html、dev-v2316/index.html）しかなく、テストは含まれていない。
- そのため、Actions を動かすには先に「テスト一式をどのリポジトリに置くか」を決める必要がある。

## 置き場所の選択肢

- 案A: Pages リポジトリに tests/ と package.json を追加する
  - 利点: 本体とテストが同じリポジトリで、dev-v2316 の変更と同時にテストが走る構成にできる
  - 注意: 公開リポジトリのためテストコードも公開される（APIキー・個人情報は含まれていないため実害は小さい）。GitHub Pages の配信には影響しない（tests/ は静的ファイルとして置かれるだけ）
- 案B: テスト専用の非公開リポジトリを別に作る
  - 利点: テストコードを公開しない
  - 注意: 本体の変更とテスト実行が別リポジトリになり、連携（本体の取得手順）が1手間増える

## ワークフロー案（YAML 下書き）

最初は自動トリガーを絞り、手動実行（workflow_dispatch）と dev-v2316 変更時のみにするのが安全。

```yaml
name: brand-regression-tests
on:
  workflow_dispatch:
  push:
    paths:
      - 'dev-v2316/**'
      - 'tests/**'
      - 'package.json'
      - 'package-lock.json'
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:brand
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: brand-test-report
          path: tests/reports/latest-report.md
```

## 導入手順（承認後に実施）

1. 置き場所（案A／案B）を決める
2. tests/、package.json、package-lock.json、.gitignore（node_modules 除外）を対象リポジトリへ追加（別途承認）
3. 上記 YAML を `.github/workflows/brand-tests.yml` として追加（別途承認）
4. 手動実行で1回動作を確認し、レポート artifact が出ることを確かめる
5. 問題なければ push トリガーを有効なまま運用開始

## 注意

- テストは Gemini API を呼ばないため、Actions 上でも API キーは不要（Secrets 設定も不要）。
- 無料枠の範囲で動く想定（月数回〜数十回の実行、1回あたり数十秒）。
- 失敗時はレポート artifact と Actions のログで原因を確認できる。
