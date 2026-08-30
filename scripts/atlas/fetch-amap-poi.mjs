// 高德 POI 逐城抓取（断点续传）。Key 与进度存 raw/，不入库。
// 运行：node scripts/atlas/fetch-amap-poi.mjs [每日查询上限，默认 95]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = join(ROOT, 'raw', 'atlas-public');
const KEY = readFileSync(join(RAW, 'amap-key.txt'), 'utf-8').trim();
const DAILY_CAP = Number(process.argv[2] ?? 95);

const KW = '精神卫生中心|精神病院|心理医院|心理咨询|精神科|心理科|睡眠医学';
const DIRECT = ['北京', '上海', '天津', '重庆'];
const CITIES = JSON.parse(readFileSync(join(RAW, 'amap-cities.json'), 'utf-8'));
// 直辖市与省会优先
const ordered = [...DIRECT, ...CITIES.filter((c) => !DIRECT.includes(c))];

const POI_FILE = join(RAW, 'amap-poi.json');
const PROG_FILE = join(RAW, 'amap-progress.json');
const pois = existsSync(POI_FILE) ? JSON.parse(readFileSync(POI_FILE, 'utf-8')) : {};
const prog = existsSync(PROG_FILE) ? JSON.parse(readFileSync(PROG_FILE, 'utf-8')) : { done: [], counts: {} };

let queries = prog.queriesUsed ?? 0;
let added = 0;
const save = () => {
  writeFileSync(POI_FILE, JSON.stringify(pois));
  writeFileSync(PROG_FILE, JSON.stringify(prog));
};

for (const city of ordered) {
  if (queries >= DAILY_CAP) { console.log(`配额上限 ${DAILY_CAP} 已达，剩余城市明日续跑`); break; }
  if (prog.done.includes(city)) continue;

  const url = `https://restapi.amap.com/v3/place/text?key=${KEY}&keywords=${encodeURIComponent(KW)}&city=${encodeURIComponent(city)}&offset=25&page=1&extensions=base`;
  try {
    const d = await (await fetch(url)).json();
    queries += 1;
    if (d.status !== '1') {
      console.log(`${city}: API 错误 infocode=${d.infocode}`);
      if (d.infocode === '10021' || d.infocode === '10044') { console.log('配额耗尽，保存进度退出'); break; }
      continue;
    }
    let cityNew = 0;
    for (const p of d.pois ?? []) {
      if (!pois[p.id]) {
        pois[p.id] = {
          id: p.id, name: p.name, type: p.type, address: p.address ?? '',
          location: p.location, cityname: p.cityname ?? city, adname: p.adname ?? ''
        };
        cityNew += 1;
        added += 1;
      }
    }
    prog.done.push(city);
    prog.counts[city] = d.count ?? 0;
    prog.queriesUsed = queries;
    console.log(`${city}: count=${d.count} 新增=${cityNew} | 累计查询 ${queries}, 累计 POI ${Object.keys(pois).length}`);
    if ((d.count ?? 0) > 25 && DIRECT.includes(city) && queries < DAILY_CAP) {
      // 直辖市补第 2 页
      const d2 = await (await fetch(`https://restapi.amap.com/v3/place/text?key=${KEY}&keywords=${encodeURIComponent(KW)}&city=${encodeURIComponent(city)}&offset=25&page=2&extensions=base`)).json();
      queries += 1;
      prog.queriesUsed = queries;
      for (const p of d2.pois ?? []) {
        if (!pois[p.id]) { pois[p.id] = { id: p.id, name: p.name, type: p.type, address: p.address ?? '', location: p.location, cityname: p.cityname ?? city, adname: p.adname ?? '' }; added += 1; }
      }
      console.log(`  ${city} 第2页 +，累计查询 ${queries}`);
    }
    save();
    await new Promise((r) => setTimeout(r, 320));
  } catch (e) {
    console.log(`${city}: 异常 ${String(e).slice(0, 60)}`);
    save();
  }
}
save();
console.log(`\n完成：本次新增 ${added}，总 POI ${Object.keys(pois).length}，已覆盖城市 ${prog.done.length}/${ordered.length}，今日查询 ${queries}`);
