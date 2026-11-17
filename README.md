# hang_study — 韓国語学習リポジトリ

韓国語の学習用リポジトリです。**学習分野ごとにブランチを分けます**(例: `grammar/adnominal-forms`)。

## このブランチの分野: 文法「連体形」
形容詞・動詞(・存在詞・이다)の連体形 `-는` / `-(으)ㄴ` / `-(으)ㄹ` を中心に、活用・変形を反復練習する問題集です。
最終目標は連体形をある程度自力で正しく使えるようになることです。

## 使い方
1. `problems/setNN/problem.md` の問題を解く(単語リストは同ファイル末尾)。
2. `problems/setNN/answer_sheet.md` に解答を記入して提出(チャットに貼り付けでも可)。
3. Claude が採点 → `grading/setNN/result.md` に結果、`progress/` に弱点記録。
4. 弱点を踏まえて次の回(setNN+1)を出題。

## 主要ファイル
- `spec/SPEC.md` … 仕様書(文法整理・採点・出題ロジック)
- `problems/` … 問題と解答用紙
- `vocab/cumulative.md` … 累積語彙リスト
- `progress/` … 弱点記録・得点履歴
- `grading/`, `answers/` … 採点時に作成

> 解答(`answers/`)は採点時まで公開しません。
