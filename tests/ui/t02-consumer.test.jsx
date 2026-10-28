import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { File as NativeFile } from 'node:buffer';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi } from 'vitest';
import { T02DevelopmentApp } from '../../src/dev/t02-consumer.jsx';
import { DEVELOPMENT_MARKER } from '../../src/dev/t02-session.js';
import { STORAGE_KEY, BACKUP_KEY_PREFIX } from '../../src/storage/constants.js';

function syntheticBootstrap() {
  const packs = [3, 4].map((number) => ({
    bundle: JSON.parse(readFileSync(resolve(`content-packs/sim-${number}/bundle.json`), 'utf8')),
    packageDigest: String(number).repeat(64)
  })).map((pack) => ({ ...pack, contentVersion: pack.bundle.contentVersion }));
  const lock = JSON.parse(readFileSync(resolve('content-pack.lock'), 'utf8'));
  return { marker: DEVELOPMENT_MARKER, scope: 'local_simulation_only', production: 'legacy', packs, policy: lock.policy, candidateVersion: packs[1].contentVersion };
}

describe('independent synthetic React development application', () => {
  test('disabled default does not fetch or touch storage', () => {
    const loadBootstrap = vi.fn();
    const nativeStorage = new Proxy({}, { get() { throw new Error('must not touch storage'); } });
    render(<T02DevelopmentApp loadBootstrap={loadBootstrap} nativeStorage={nativeStorage}/>);
    expect(screen.getByRole('heading', { name: '开发消费入口已关闭' })).toBeInTheDocument();
    expect(loadBootstrap).not.toHaveBeenCalled();
  });

  test('bootstrap failure cannot initialize an incomplete package', async () => {
    const loadBootstrap = async () => ({ marker: 'fictional-invalid' });
    const before = window.localStorage.length;
    render(<T02DevelopmentApp enabled loadBootstrap={loadBootstrap}/>);
    await screen.findByText('DEV_BOOTSTRAP_REJECTED');
    expect(window.localStorage.length).toBe(before);
  });

  test('actual React controls search/details, synthetic edits and withdrawal after storage merge', async () => {
    const user = userEvent.setup();
    const bootstrap = syntheticBootstrap();
    window.localStorage.setItem(STORAGE_KEY, 'fictional-original-user');
    window.localStorage.setItem(`${BACKUP_KEY_PREFIX}fictional`, 'fictional-original-backup');
    render(<T02DevelopmentApp enabled loadBootstrap={async () => bootstrap}/>);
    await screen.findByRole('button', { name: '注入虚构可信状态' });
    await user.click(screen.getByRole('button', { name: '注入虚构可信状态' }));
    const diseaseName = bootstrap.packs[1].bundle.entities.find((item) => item.legacy?.collection === 'disorders').payload.name;
    await user.type(screen.getByLabelText('搜索虚构条目'), diseaseName);
    await user.click(within(screen.getByTestId('search-results')).getByRole('button', { name: diseaseName }));
    expect(within(screen.getByRole('region', { name: '虚构条目详情' })).getByRole('heading', { level: 3, name: diseaseName })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '写入虚构本地编辑' }));
    await user.click(screen.getByRole('button', { name: '创建隔离备份' }));
    await user.click(screen.getByRole('button', { name: '撤回虚构疾病' }));
    await waitFor(() => expect(JSON.parse(screen.getByTestId('consumer-state').textContent).counts.disorders).toBe(0));
    expect(within(screen.getByTestId('search-results')).queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('heading', { level: 3, name: diseaseName })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('已核验合成包'), bootstrap.packs[0].contentVersion);
    await user.click(screen.getByRole('button', { name: '恢复最新隔离备份' }));
    expect(JSON.parse(screen.getByTestId('consumer-state').textContent).counts.disorders).toBe(0);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('fictional-original-user');
    expect(window.localStorage.getItem(`${BACKUP_KEY_PREFIX}fictional`)).toBe('fictional-original-backup');
  });

  test('an open React page automatically hides expired state without a reader action', async () => {
    const user = userEvent.setup();
    let clock = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    const bootstrap = syntheticBootstrap();
    render(<T02DevelopmentApp enabled loadBootstrap={async () => bootstrap}/>);
    await screen.findByRole('button', { name: '注入虚构可信状态' });
    await user.click(screen.getByRole('button', { name: '注入虚构可信状态' }));
    expect(JSON.parse(screen.getByTestId('consumer-state').textContent).counts.disorders).toBe(1);
    clock += 2 * 60 * 60 * 1000;
    await waitFor(() => expect(JSON.parse(screen.getByTestId('consumer-state').textContent).fresh).toBe(false), { timeout: 2500 });
    expect(Object.values(JSON.parse(screen.getByTestId('consumer-state').textContent).counts).every((count) => count === 0)).toBe(true);
  });

  test('actual File invalid UTF-8 produces no import confirmation or writes', async () => {
    const user = userEvent.setup();
    const bootstrap = syntheticBootstrap();
    render(<T02DevelopmentApp enabled loadBootstrap={async () => bootstrap}/>);
    await screen.findByRole('button', { name: '注入虚构可信状态' });
    const before = Object.fromEntries(Object.keys(window.localStorage).map((key) => [key, window.localStorage.getItem(key)]));
    const file = new NativeFile([Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d])], 'fictional-invalid-utf8.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText('导入虚构备份'), file);
    expect(await screen.findByRole('alert')).toHaveTextContent('DEV_IMPORT_UTF8_INVALID');
    expect(screen.queryByRole('button', { name: '确认导入虚构备份' })).not.toBeInTheDocument();
    expect(Object.fromEntries(Object.keys(window.localStorage).map((key) => [key, window.localStorage.getItem(key)]))).toEqual(before);
  });
});
