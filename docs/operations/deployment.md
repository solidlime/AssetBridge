# デプロイ・再起動手順

## コード変更後の必須手順

```bash
bash scripts/reload.sh
```

これ1コマンドで以下を自動実行する：
1. DB マイグレーション（未適用分のみ検出・実行）
2. Next.js ビルド（`@assetbridge/web`）
3. PM2 グレースフルリロード（全プロセス）
4. API ヘルスチェック（最大30秒待機）

### ⚠️ やってはいけないこと

```bash
# ❌ 絶対禁止 - マイグレーション未適用でロールオーバーが起きる
pm2 reload all
pm2 restart all

# ✅ 正しい手順
bash scripts/reload.sh
```

オプション:
- `--skip-migrate` : マイグレーションをスキップ（スキーマ変更なしの場合のみ）
- `--skip-build`   : ビルドをスキップ（web 非変更の場合のみ）

---

## マイグレーション

### 追加手順
1. `packages/db/src/migrations/` に SQL ファイルを追加
2. `bash scripts/reload.sh` を実行（自動検出・適用）

### 仕組み
- `scripts/migrate.ts`（Bun）が未適用のマイグレーションを自動検出・実行
- べき等設計：`already exists` / `duplicate column` エラーは無視
- マイグレーション適用済み記録は DB 内 `__drizzle_migrations` テーブルで管理

---

## よくある問題と対処法

### マイグレーション未適用でエラーが出る

```
column "xxx" of relation "yyy" does not exist
```

**対処:** `bash scripts/reload.sh` を実行

---

### SQLITE_BUSY_RECOVERY (errno: 261)

```
SQLITE_BUSY_RECOVERY: database is locked
```

**原因:** 複数プロセスが同時に DB へアクセスしている  
**対処:** 設定済み（`packages/db/src/client.ts` で `PRAGMA busy_timeout = 5000`）— 自動リトライされる

---

### PM2 web プロセスが起動しない

```bash
pm2 list           # 状態確認
pm2 logs web --err # エラーログ確認
```

よくある原因:
- `.next` ビルド未実行 → `bash scripts/reload.sh` で解消
- 型エラー → `pnpm --filter @assetbridge/web type-check`
- PM2 が stopped 状態（restart ループ後）→ `pm2 delete web && bash scripts/reload.sh`

---

### API が応答しない

```bash
curl -s --noproxy "*" http://localhost:8000/health
pm2 logs api --err
```

---

## プロセス一覧

| プロセス名 | ポート | 説明 |
|-----------|--------|------|
| `api`     | 8000   | Hono + tRPC REST API |
| `mcp`     | 8001   | MCP サーバ（Streamable HTTP） |
| `web`     | 3000   | Next.js ダッシュボード |
| `worker`  | -      | ジョブキューワーカー |

---

## 関連ファイル

- `ecosystem.config.cjs` — PM2 プロセス設定
- `scripts/reload.sh` — コード変更後の標準再起動スクリプト
- `scripts/migrate.ts` — DB マイグレーション実行スクリプト（Bun）
- `packages/db/src/migrations/` — SQL マイグレーションファイル
- `packages/db/src/client.ts` — SQLite クライアント設定（busy_timeout など）
