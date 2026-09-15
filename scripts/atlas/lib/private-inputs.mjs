// 私有输入解析：人工审阅队列与清单属于本地私有数据，不进版本库。
//
// 之前这几个脚本里写死了某台机器上的绝对路径（用户下载目录下的人工审阅队列）。
// 那既是真实个人路径、又会把私有数据的位置固化进仓库，AGENTS.md 明确禁止提交。
// 现在统一走这里：优先读环境变量，其次回退到仓库内 work/ 目录（work/ 已在 .gitignore 中）。
// 脚本本身因此可以安全提交。
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** 私有输入的默认存放目录，可用 SYM_PRIVATE_DIR 覆盖 */
export const PRIVATE_DIR = process.env.SYM_PRIVATE_DIR ?? join(ROOT, 'work');

function resolve(envVar, defaultName, hint) {
  const path = process.env[envVar] ?? join(PRIVATE_DIR, defaultName);
  if (!existsSync(path)) {
    throw new Error(
      `找不到私有输入文件：${path}\n`
      + '  它不在版本库里，需要本地提供。\n'
      + `  方式一：把文件放到 ${join(PRIVATE_DIR, defaultName)}\n`
      + `  方式二：设置环境变量 ${envVar}（或 SYM_PRIVATE_DIR）指向它\n`
      + (hint ? `  说明：${hint}` : '')
    );
  }
  return path;
}

/** 第一批人工审阅队列（含私密正文，不发布） */
export const reviewQueue = () => resolve(
  'SYM_REVIEW_QUEUE',
  'review-queue-private.json',
  '含待审阅的用户生成文本，属于私有数据，不要提交。'
);

/** 审阅清单（只有计数与哈希，不含正文） */
export const reviewManifest = () => resolve(
  'SYM_REVIEW_MANIFEST',
  'review-manifest.json'
);
