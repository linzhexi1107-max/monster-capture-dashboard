# 怪物捕获分析

基于 MySQL 的公开只读分析页。页面展示除 `monster_config_id` 外的全部查询结果字段，并支持：

- `start_date` 日期范围筛选
- `arena_id` 竞技场筛选
- `monster_name` 怪物名称多选筛选
- 消耗占比 + 当日总消耗价值双纵轴折线图
- 独立 RTP 折线图
- 用户击杀率折线图
- 怪物击杀率折线图
- 按 `monster_config_id` 计算近 7 日平均怪物击杀率，低于自身均值的点标红
- 最近 7 日 `config_cost_ratio` 前十怪物排行
- 配置消耗和数量字段自动换算为 K/B/T
- 明细数据分页
- 每天北京时间 08:00 自动刷新前一日数据
- 未配置数据库时自动使用明确标记的演示数据

## 本地运行

需要 Node.js 20 或更高版本。

```powershell
npm install
Copy-Item .env.example .env
npm start
```

打开 <http://localhost:3000>。

如果在 `.env` 中填写 MySQL 配置，页面会读取真实数据；否则使用演示数据。

## MySQL 配置

```
MYSQL_HOST=数据库地址
MYSQL_PORT=3306
MYSQL_USER=只读账号
MYSQL_PASSWORD=密码
MYSQL_DATABASE=数据库名
MYSQL_SSL=false
DATA_START_DATE=2026-10-11
```

只读账号至少需要读取以下业务表：

- `ods_game_catch_attack_balance_record`
- `ods_game_catch_special_monster_reward_detail`

`monster_config_id` 仅用于分组和近 7 日均值计算，不在页面表格或图表文字中展示。

消耗占比、RTP、用户击杀率和怪物击杀率均按怪物分别绘制曲线，不会把不同怪物
聚合成一条数据。双轴图的次轴使用 SQL 结果中的 `daily_total_cost`，页面显示名称为
“当日总消耗价值”，单位统一为 T。

近 7 日消耗占比前十使用所选结束日期向前 7 个自然日的数据，按怪物汇总
`config_cost`，再除以对应日期、竞技场去重后的 `daily_total_cost` 总和。
排行会应用竞技场筛选，但不会因为选择单个怪物而缩减前十名单。

首次启动会从 `DATA_START_DATE` 回溯查询到前一日，并把结果保存为
`data/snapshot.json`。之后每天 08:00 只重新查询前一日并合并进快照。

也可以手动执行增量刷新：

```powershell
npm run refresh
```

如果希望刷新更早的历史数据，删除 `data/snapshot.json` 后重新执行。

## 时间与刷新

- 业务日期时区：`Asia/Shanghai`
- 自动刷新时间：每天 `08:00`
- 每次刷新范围：前一自然日
- 服务重启后若发现快照缺失历史日期，会自动补查缺失区间

定时任务由应用自身执行，因此部署平台必须让 Node 服务持续运行。无服务器函数或会自动休眠的免费实例不适合承担精确的每日刷新。

## Docker

```powershell
docker build -t monster-dashboard .
docker run --rm -p 3000:3000 --env-file .env monster-dashboard
```

仓库内的 `railway.json` 已配置 Dockerfile 部署与 `/healthz` 健康检查。选择 Railway、Render、Fly.io 或自有服务器均可。

## 公网部署注意

- 页面默认公开只读，不提供数据库写入接口。
- 数据库账号密码只放在平台环境变量中，不要写入前端或提交到 Git。
- 建议使用只读 MySQL 账号，并限制该账号只能访问所需业务表。
- 如果平台磁盘不是持久化的，重启后会重新回溯查询；不影响数据正确性，但会增加数据库压力。
- 绑定公网域名后即可通过 HTTPS 链接访问。

## GitHub Pages 免费长期托管

`docs/` 是静态版本，`GitHub Actions` 每天北京时间 08:00 连接 MySQL、
刷新快照并重新发布 GitHub Pages。首次运行时需要在仓库中配置以下 Secrets：

```
MYSQL_HOST
MYSQL_PORT
MYSQL_USER
MYSQL_PASSWORD
MYSQL_DATABASE
```

并在仓库 `Settings -> Pages` 中将发布来源设为 `GitHub Actions`。

每次更新只查询本次缺失日期（正常运行时为前一天），并把新数据合并进完整
`docs/data/dashboard-data.json`。合并后的快照会提交回仓库，因此历史数据不会
被删除；页面始终直接读取这份完整快照。

## 测试

```powershell
npm test
```
