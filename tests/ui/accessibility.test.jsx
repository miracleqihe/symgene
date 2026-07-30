import React from 'react';
import axe from 'axe-core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { App } from '../../src/app/App.jsx';
import { createKnowledgeExport } from '../../src/storage/importExport.js';
import { STORAGE_KEY } from '../../src/storage/constants.js';
import { seedStoredData } from './fixtures.js';

async function renderApp({ canEdit = false, enter = true } = {}) {
  seedStoredData();
  const user = userEvent.setup();
  const result = render(<App canEdit={canEdit} />);
  if (enter) {
    await user.click(screen.getByRole('button', { name: /进入知识库/ }));
  }
  return { user, ...result };
}

function navButton(name) {
  const visibleName = name === '精神药物' ? '药物' : name;
  return within(screen.getByRole('navigation', { name: '主导航' }))
    .getByRole('button', { name: new RegExp(visibleName) });
}

async function expectNoSeriousAxeViolations(container) {
  const result = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false }
    }
  });
  const serious = result.violations
    .filter((violation) => ['critical', 'serious'].includes(violation.impact))
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target)
    }));
  expect(serious).toEqual([]);
}

describe('axe 可访问性基线', () => {
  test('欢迎页无 critical 或 serious 错误', async () => {
    const { container } = await renderApp({ enter: false });
    await expectNoSeriousAxeViolations(container);
  });

  test('首页无 critical 或 serious 错误', async () => {
    const { container } = await renderApp();
    await expectNoSeriousAxeViolations(container);
  });

  test('搜索结果无 critical 或 serious 错误', async () => {
    const { container, user } = await renderApp();
    await user.type(screen.getByRole('textbox', { name: '描述你正在经历的情况' }), '最近总是早醒');
    await expectNoSeriousAxeViolations(container);
  });

  test('严重风险提示无 critical 或 serious 错误', async () => {
    const { container, user } = await renderApp();
    await user.type(screen.getByRole('textbox', { name: '描述你正在经历的情况' }), '我想自杀');
    await expectNoSeriousAxeViolations(container);
  });

  test.each(['精神药物', '疾病科普', '案例分析', '网络资源'])(
    '%s 页面无 critical 或 serious 错误',
    async (page) => {
      const { container, user } = await renderApp();
      await user.click(navButton(page));
      await expectNoSeriousAxeViolations(container);
    }
  );

  test('药物详情分区导航无 critical 或 serious 错误', async () => {
    const { container, user } = await renderApp();
    await user.click(navButton('精神药物'));
    await user.click(screen.getByRole('button', { name: /舍曲林/ }));
    await expectNoSeriousAxeViolations(container);
  });

  test('编辑器无 critical 或 serious 错误', async () => {
    const { container, user } = await renderApp({ canEdit: true });
    await user.click(navButton('疾病科普'));
    await user.click(screen.getByRole('button', { name: '新增词条' }));
    await expectNoSeriousAxeViolations(container);
  });

  test('本地数据面板无 critical 或 serious 错误', async () => {
    const { container, user } = await renderApp({ canEdit: true });
    await user.click(screen.getByRole('button', { name: '本地数据' }));
    await expectNoSeriousAxeViolations(container);
  });
});

describe('模态框键盘与焦点', () => {
  test('编辑器打开后焦点进入模态框', async () => {
    const { user } = await renderApp({ canEdit: true });
    await user.click(navButton('疾病科普'));
    await user.click(screen.getByRole('button', { name: '新增词条' }));
    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();
  });

  test('Escape 关闭编辑器并把焦点还给触发按钮', async () => {
    const { user } = await renderApp({ canEdit: true });
    await user.click(navButton('疾病科普'));
    const trigger = screen.getByRole('button', { name: '新增词条' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '编辑词条' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test('编辑器 Tab 焦点在模态框内循环', async () => {
    const { user } = await renderApp({ canEdit: true });
    await user.click(navButton('疾病科普'));
    await user.click(screen.getByRole('button', { name: '新增词条' }));
    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button', { name: '保存词条' })).toHaveFocus();
  });

  test('本地数据面板支持焦点进入、Escape 关闭和焦点恢复', async () => {
    const { user } = await renderApp({ canEdit: true });
    const trigger = screen.getByRole('button', { name: '本地数据' });
    await user.click(trigger);
    expect(screen.getByRole('button', { name: '关闭本地数据' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '本地数据' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe('提示与控件语义', () => {
  test('成功 toast 使用 polite live region', async () => {
    const { user } = await renderApp({ canEdit: true });
    await user.click(navButton('精神药物'));
    await user.click(screen.getByRole('button', { name: '新增词条' }));
    await user.type(screen.getByRole('textbox', { name: '名称' }), '虚构测试药物');
    await user.click(screen.getByRole('button', { name: '保存词条' }));
    const toast = await screen.findByRole('status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
  });

  test('错误 toast 使用 alert 且不会与成功 toast 重叠', async () => {
    seedStoredData();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const user = userEvent.setup();
    render(<App canEdit />);
    await user.click(screen.getByRole('button', { name: /进入知识库/ }));
    const toast = await screen.findByRole('alert');
    expect(toast).toHaveAttribute('aria-live', 'assertive');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('所有图标按钮都有可访问名称', async () => {
    const { container, user } = await renderApp({ canEdit: true });
    await user.click(navButton('疾病科普'));
    await user.click(screen.getByRole('button', { name: /抑郁障碍/ }));
    const iconButtons = [...container.querySelectorAll('button.icon-button')];
    expect(iconButtons.length).toBeGreaterThan(0);
    iconButtons.forEach((button) => expect(button).toHaveAccessibleName());
  });
});

describe('本地数据文件交互', () => {
  test('公开模式不显示本地数据入口', async () => {
    await renderApp({ canEdit: false });
    expect(screen.queryByRole('button', { name: '本地数据' })).not.toBeInTheDocument();
  });

  test('无效 JSON 文件显示非敏感错误', async () => {
    const { user } = await renderApp({ canEdit: true });
    await user.click(screen.getByRole('button', { name: '本地数据' }));
    const file = new File(['{broken'], 'backup.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText('选择本地备份文件'), file);
    expect(await screen.findByRole('alert')).toHaveTextContent('不是有效 JSON');
  });

  test('超大文件在读取前被拒绝', async () => {
    const { user } = await renderApp({ canEdit: true });
    await user.click(screen.getByRole('button', { name: '本地数据' }));
    const file = new File(['{}'], 'large.json', { type: 'application/json' });
    Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 + 1 });
    await user.upload(screen.getByLabelText('选择本地备份文件'), file);
    expect(await screen.findByRole('alert')).toHaveTextContent('超过 5 MB');
  });

  test('导入确认可取消且不显示成功提示', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await renderApp({ canEdit: true });
    const envelope = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    const payload = createKnowledgeExport(envelope, {
      now: new Date('2026-07-29T12:00:00.000Z')
    });
    await user.click(screen.getByRole('button', { name: '本地数据' }));
    const file = new File(
      [JSON.stringify(payload)],
      'backup.json',
      { type: 'application/json' }
    );
    await user.upload(screen.getByLabelText('选择本地备份文件'), file);
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(screen.queryByText('本地备份已导入')).not.toBeInTheDocument();
  });
});
