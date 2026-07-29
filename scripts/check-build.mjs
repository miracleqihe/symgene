import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST_DIRECTORY = path.join(PROJECT_ROOT, 'dist');
const INDEX_FILE = path.join(DIST_DIRECTORY, 'index.html');
const ASSETS_DIRECTORY = path.join(DIST_DIRECTORY, 'assets');
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.map', '.svg', '.txt', '.xml']);
const FORBIDDEN_PATTERNS = [
  ['私有目录引用', /(?:^|["'=(\s\\/])(?:raw|work|tmp)[\\/]/i],
  ['file:// URL', /file:\/\//i],
  ['macOS 本地路径', /\/Users\/[^/\\\s]+[\\/]/i],
  ['Linux 本地路径', /\/home\/[^/\\\s]+[\\/]/i],
  ['Windows 本地路径', /[A-Za-z]:[\\/]Users[\\/][^\\/\s]+[\\/]/i],
  ['UNC 网络路径', /["']\\\\\\\\[A-Za-z0-9._-]+\\\\[A-Za-z0-9.$_-]+/]
];

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
}

export function checkBuild() {
  const errors = [];
  if (!fs.existsSync(INDEX_FILE)) {
    errors.push('dist/index.html 不存在');
  }
  if (!fs.existsSync(ASSETS_DIRECTORY) || !fs.statSync(ASSETS_DIRECTORY).isDirectory()) {
    errors.push('dist/assets/ 不存在或不是目录');
  }

  const files = collectFiles(DIST_DIRECTORY);
  const javascriptFiles = files.filter((file) => file.endsWith('.js'));
  const cssFiles = files.filter((file) => file.endsWith('.css'));
  if (!javascriptFiles.length) errors.push('dist/ 中没有 JavaScript 构建文件');
  if (!cssFiles.length) errors.push('dist/ 中没有 CSS 构建文件');

  if (fs.existsSync(INDEX_FILE)) {
    const indexHtml = fs.readFileSync(INDEX_FILE, 'utf8');
    if (!/<div\s+id=["']root["']\s*><\/div>/i.test(indexHtml)) {
      errors.push('dist/index.html 不包含应用根节点 #root');
    }
  }

  const scannedFiles = files.filter((file) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()));
  scannedFiles.forEach((file) => {
    const contents = fs.readFileSync(file, 'utf8');
    FORBIDDEN_PATTERNS.forEach(([label, pattern]) => {
      if (pattern.test(contents)) {
        errors.push(`${path.relative(PROJECT_ROOT, file)} 包含${label}`);
      }
    });
  });

  return {
    errors,
    filesScanned: scannedFiles.length,
    javascriptFiles: javascriptFiles.length,
    cssFiles: cssFiles.length
  };
}

export function reportBuildCheck(output = console) {
  const result = checkBuild();
  if (result.errors.length) {
    output.error(`Build validation failed (${result.errors.length} errors):`);
    result.errors.forEach((error) => output.error(`- ${error}`));
    return 1;
  }
  output.log('Build validation passed:');
  output.log('- dist/index.html and dist/assets/ exist');
  output.log(`- ${result.javascriptFiles} JavaScript bundle(s)`);
  output.log(`- ${result.cssFiles} CSS bundle(s)`);
  output.log(`- ${result.filesScanned} text build file(s) contain no private/local references`);
  return 0;
}

process.exitCode = reportBuildCheck();
