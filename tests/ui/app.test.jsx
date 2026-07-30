import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { App } from '../../src/app/App.jsx';
import { BACKUP_FORMAT } from '../../src/storage/importExport.js';
import { createStoredData, seedStoredData, STORAGE_KEY } from './fixtures.js';

async function renderApp({
  canEdit = false,
  enter = true,
  reducedMotion = true,
  storedData = createStoredData(),
  beforeRender
} = {}) {
  mockReducedMotion(reducedMotion);
  seedStoredData(storedData);
  beforeRender?.();
  const user = userEvent.setup();
  const result = render(<App canEdit={canEdit} />);
  if (enter) {
    await user.click(screen.getByRole('button', { name: /进入知识库/ }));
  }
  return { user, ...result };
}

function dataWithUnrelatedDisorder() {
  const data = createStoredData();
  data.disorders.push({
    id: 'disorder-unrelated',
    name: '虚构无案例疾病',
    category: '虚构测试分类',
    summary: '仅用于本地删除保护测试。',
    source: '公开测试来源',
    relatedDrugIds: []
  });
  return data;
}

function dataWithSecondDrug() {
  const data = createStoredData();
  data.drugs.push({
    ...data.drugs[0],
    id: 'drug-second-test',
    name: '虚构第二药物',
    aliases: 'Second Test Drug',
    indication: '第二药物适用情境',
    action: '第二药物作用'
  });
  return data;
}

function currentEnvelope() {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY));
}

function importFileFromCurrent(update, filename = 'symgene-test-backup.json') {
  const envelope = structuredClone(currentEnvelope());
  update?.(envelope);
  const payload = {
    format: BACKUP_FORMAT,
    schemaVersion: envelope.schemaVersion,
    seedVersion: envelope.seedVersion,
    exportedAt: envelope.savedAt,
    data: envelope.data,
    deletedIds: envelope.deletedIds
  };
  return new File([JSON.stringify(payload)], filename, { type: 'application/json' });
}

function storeBackupFromCurrent(update, timestamp = '2026-07-29T13-00-00.000Z') {
  const envelope = structuredClone(currentEnvelope());
  update?.(envelope);
  window.localStorage.setItem(`symgene-wiki-backup-${timestamp}`, JSON.stringify(envelope));
}

function mockReducedMotion(matches) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

function navButton(name) {
  const visibleName = name === '精神药物' ? '药物' : name;
  return within(screen.getByRole('navigation', { name: '主导航' }))
    .getByRole('button', { name: new RegExp(visibleName) });
}

async function openPage(user, name) {
  await user.click(navButton(name));
}

describe('欢迎页', () => {
  test('初始显示欢迎页', async () => {
    await renderApp({ enter: false });
    expect(screen.getByRole('main')).toHaveClass('welcome-screen');
  });

  test('显示项目名称和免责声明', async () => {
    await renderApp({ enter: false });
    expect(screen.getByRole('heading', { name: 'Sym Gen' })).toBeVisible();
    expect(screen.getByText('本站仅供信息参考，不替代医生的诊断与处方')).toBeVisible();
  });

  test('点击进入知识库后显示主应用', async () => {
    const { user } = await renderApp({ enter: false });
    await user.click(screen.getByRole('button', { name: /进入知识库/ }));
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeVisible();
  });

  test('欢迎页不显示开发编辑控件', async () => {
    await renderApp({ canEdit: true, enter: false });
    expect(screen.queryByRole('button', { name: /新增/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('导航', () => {
  test.each([
    ['精神药物', '精神药物'],
    ['疾病科普', '疾病科普'],
    ['案例分析', '案例分析'],
    ['网络资源', '网络资源']
  ])('主导航可切换到%s', async (navName, heading) => {
    const { user } = await renderApp();
    await openPage(user, navName);
    expect(screen.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  });

  test('回到首页会按当前行为清空查询', async () => {
    const { user } = await renderApp();
    const input = screen.getByRole('textbox', { name: '描述你正在经历的情况' });
    await user.type(input, '早醒');
    await openPage(user, '精神药物');
    await openPage(user, '首页');
    expect(screen.getByRole('textbox', { name: '描述你正在经历的情况' })).toHaveValue('');
  });

  test('移动导航打开状态不会污染页面切换', async () => {
    const { user, container } = await renderApp();
    await user.click(screen.getByRole('button', { name: '打开导航' }));
    expect(container.querySelector('.sidebar')).toHaveClass('is-open');
    await openPage(user, '网络资源');
    expect(container.querySelector('.sidebar')).not.toHaveClass('is-open');
  });
});

describe('搜索', () => {
  test('输入查询后显示结果区域', async () => {
    const { user, container } = await renderApp();
    await user.type(screen.getByRole('textbox', { name: '描述你正在经历的情况' }), '早醒');
    expect(container.querySelector('.search-results')).toBeVisible();
  });

  test('清除按钮会清空查询', async () => {
    const { user } = await renderApp();
    const input = screen.getByRole('textbox', { name: '描述你正在经历的情况' });
    await user.type(input, '早醒');
    await user.click(screen.getByRole('button', { name: '清除描述' }));
    expect(input).toHaveValue('');
  });

  test('Ctrl + K 聚焦搜索框', async () => {
    const { user } = await renderApp();
    await user.keyboard('{Control>}k{/Control}');
    await waitFor(() => expect(screen.getByRole('textbox', { name: '描述你正在经历的情况' })).toHaveFocus());
  });

  test('Meta + K 聚焦搜索框', async () => {
    const { user } = await renderApp();
    await user.keyboard('{Meta>}k{/Meta}');
    await waitFor(() => expect(screen.getByRole('textbox', { name: '描述你正在经历的情况' })).toHaveFocus());
  });

  test('快捷键会切换回首页', async () => {
    const { user } = await renderApp();
    await openPage(user, '精神药物');
    await user.keyboard('{Control>}k{/Control}');
    await waitFor(() => expect(screen.getByRole('textbox', { name: '描述你正在经历的情况' })).toHaveFocus());
  });

  test('正常动画下从药物页按 Ctrl + K 会在首页挂载后聚焦', async () => {
    const { user } = await renderApp({ reducedMotion: false });
    await openPage(user, '精神药物');
    await user.keyboard('{Control>}k{/Control}');
    await waitFor(
      () => expect(screen.getByRole('textbox', { name: '描述你正在经历的情况' })).toHaveFocus(),
      { timeout: 1500 }
    );
  });

  test('正常动画下从疾病页按 Meta + K 会在首页挂载后聚焦', async () => {
    const { user } = await renderApp({ reducedMotion: false });
    await openPage(user, '疾病科普');
    await user.keyboard('{Meta>}k{/Meta}');
    await waitFor(
      () => expect(screen.getByRole('textbox', { name: '描述你正在经历的情况' })).toHaveFocus(),
      { timeout: 1500 }
    );
  });

  test('reduced-motion 下从案例页按 Ctrl + K 仍会聚焦', async () => {
    const { user } = await renderApp({ reducedMotion: true });
    await openPage(user, '案例分析');
    await user.keyboard('{Control>}k{/Control}');
    await waitFor(() => expect(screen.getByRole('textbox', { name: '描述你正在经历的情况' })).toHaveFocus());
  });

  test('页面切换期间连续触发两次快捷键仍会聚焦最新首页搜索框', async () => {
    const { user } = await renderApp({ reducedMotion: false });
    await openPage(user, '精神药物');
    await user.keyboard('{Control>}k{/Control}');
    await user.keyboard('{Control>}k{/Control}');
    await waitFor(
      () => expect(screen.getByRole('textbox', { name: '描述你正在经历的情况' })).toHaveFocus(),
      { timeout: 1500 }
    );
  });

  test('快捷键会阻止浏览器默认行为', async () => {
    await renderApp();
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.getByRole('textbox', { name: '描述你正在经历的情况' })).toHaveFocus());
  });

  test('普通查询显示疾病线索', async () => {
    const { user } = await renderApp();
    await user.type(screen.getByRole('textbox', { name: '描述你正在经历的情况' }), '最近总是早醒');
    expect(screen.getByText('可能相关的疾病线索')).toBeVisible();
    expect(screen.getByRole('button', { name: /抑郁障碍/ })).toBeVisible();
  });

  test('严重风险查询显示风险提示', async () => {
    const { user, container } = await renderApp();
    await user.type(screen.getByRole('textbox', { name: '描述你正在经历的情况' }), '我想自杀');
    expect(container.querySelector('.risk-banner.critical')).toBeVisible();
  });

  test('严重风险不显示普通疾病结果', async () => {
    const { user } = await renderApp();
    await user.type(screen.getByRole('textbox', { name: '描述你正在经历的情况' }), '我想自杀');
    expect(screen.queryByText('可能相关的疾病线索')).not.toBeInTheDocument();
  });

  test('严重风险不显示案例结果', async () => {
    const { user } = await renderApp();
    await user.type(screen.getByRole('textbox', { name: '描述你正在经历的情况' }), '我想自杀');
    expect(screen.queryByText('相似案例')).not.toBeInTheDocument();
  });

  test('严重风险不显示药物结果', async () => {
    const { user } = await renderApp();
    await user.type(screen.getByRole('textbox', { name: '描述你正在经历的情况' }), '我想自杀');
    expect(screen.queryByText('关联治疗与药物资料')).not.toBeInTheDocument();
  });
});

describe('详情', () => {
  test('可打开疾病详情', async () => {
    const { user } = await renderApp();
    await openPage(user, '疾病科普');
    await user.click(screen.getByRole('button', { name: /抑郁障碍/ }));
    expect(screen.getByRole('heading', { name: '抑郁障碍', level: 2 })).toBeVisible();
  });

  test('可打开药物详情', async () => {
    const { user } = await renderApp();
    await openPage(user, '精神药物');
    await user.click(screen.getByRole('button', { name: /舍曲林/ }));
    expect(screen.getByRole('heading', { name: '舍曲林', level: 2 })).toBeVisible();
  });

  test('可打开案例详情', async () => {
    const { user } = await renderApp();
    await openPage(user, '案例分析');
    await user.click(screen.getByRole('button', { name: /持续低落与早醒案例/ }));
    expect(screen.getByRole('heading', { name: '持续低落与早醒案例', level: 2 })).toBeVisible();
  });

  test('案例可跳转到关联疾病', async () => {
    const { user } = await renderApp();
    await openPage(user, '案例分析');
    await user.click(screen.getByRole('button', { name: '查看疾病词条' }));
    expect(screen.getByRole('heading', { name: '疾病科普', level: 1 })).toBeVisible();
    expect(screen.getByRole('heading', { name: '抑郁障碍', level: 2 })).toBeVisible();
  });

  test('资源链接包含安全 rel 属性', async () => {
    const { user } = await renderApp();
    await openPage(user, '网络资源');
    expect(screen.getByRole('link', { name: '打开资源' })).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  test('恢复默认数据会清除已不存在的当前详情且无需刷新', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = await renderApp({
      canEdit: true,
      storedData: dataWithUnrelatedDisorder()
    });
    await openPage(user, '疾病科普');
    await user.click(screen.getByRole('button', { name: /虚构无案例疾病/ }));
    expect(screen.getByRole('heading', { name: '虚构无案例疾病', level: 2 })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '本地数据' }));
    await user.click(screen.getByRole('button', { name: '恢复默认数据' }));
    await user.click(screen.getByRole('button', { name: '关闭本地数据' }));

    await waitFor(() => expect(screen.queryByText('仅用于本地删除保护测试。')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: '选择一个疾病词条' })).toBeVisible();
  });

  test('导入替换同 ID 数据会立即更新当前详情', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = await renderApp({ canEdit: true });
    await openPage(user, '精神药物');
    await user.click(screen.getByRole('button', { name: /舍曲林/ }));
    await user.click(screen.getByRole('tab', { name: '药物作用' }));
    expect(screen.getByText('测试药物作用')).toBeVisible();
    const file = importFileFromCurrent((envelope) => {
      envelope.data.drugs[0].action = '导入后更新的虚构药物作用';
    });

    await user.click(screen.getByRole('button', { name: '本地数据' }));
    await user.upload(screen.getByLabelText('选择本地备份文件'), file);
    await user.click(screen.getByRole('button', { name: '关闭本地数据' }));

    expect(await screen.findByText('导入后更新的虚构药物作用')).toBeVisible();
    expect(screen.queryByText('测试药物作用')).not.toBeInTheDocument();
  });

  test('恢复不存在当前 ID 的备份会清除详情', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = await renderApp({
      canEdit: true,
      storedData: dataWithUnrelatedDisorder(),
      beforeRender() {
        storeBackupFromCurrent((envelope) => {
          envelope.data.disorders = envelope.data.disorders
            .filter((item) => item.id !== 'disorder-unrelated');
        });
      }
    });
    await openPage(user, '疾病科普');
    await user.click(screen.getByRole('button', { name: /虚构无案例疾病/ }));
    await user.click(screen.getByRole('button', { name: '本地数据' }));
    await user.click(screen.getAllByRole('button', { name: '恢复' }).at(-1));
    await user.click(screen.getByRole('button', { name: '关闭本地数据' }));

    await waitFor(() => expect(screen.queryByText('仅用于本地删除保护测试。')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: '选择一个疾病词条' })).toBeVisible();
  });

  test('恢复包含同 ID 新内容的备份会立即更新详情', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = await renderApp({
      canEdit: true,
      beforeRender() {
        storeBackupFromCurrent((envelope) => {
          envelope.data.drugs[0].action = '恢复后更新的虚构药物作用';
        });
      }
    });
    await openPage(user, '精神药物');
    await user.click(screen.getByRole('button', { name: /舍曲林/ }));
    await user.click(screen.getByRole('tab', { name: '药物作用' }));
    await user.click(screen.getByRole('button', { name: '本地数据' }));
    await user.click(screen.getAllByRole('button', { name: '恢复' }).at(-1));
    await user.click(screen.getByRole('button', { name: '关闭本地数据' }));

    expect(await screen.findByText('恢复后更新的虚构药物作用')).toBeVisible();
    expect(screen.queryByText('测试药物作用')).not.toBeInTheDocument();
  });

  test('替换无关数据时当前详情保持可见且不会触发无限更新', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user } = await renderApp({ canEdit: true });
    await openPage(user, '精神药物');
    await user.click(screen.getByRole('button', { name: /舍曲林/ }));
    await user.click(screen.getByRole('tab', { name: '药物作用' }));
    const file = importFileFromCurrent((envelope) => {
      envelope.data.disorders[0].summary = '仅更新无关疾病的虚构测试摘要。';
    });

    await user.click(screen.getByRole('button', { name: '本地数据' }));
    await user.upload(screen.getByLabelText('选择本地备份文件'), file);
    await user.click(screen.getByRole('button', { name: '关闭本地数据' }));

    expect(screen.getByRole('heading', { name: '舍曲林', level: 2 })).toBeVisible();
    expect(screen.getByText('测试药物作用')).toBeVisible();
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('Maximum update depth exceeded');
  });
});

describe('药物详情分区导航', () => {
  async function openDrugDetail(user, name = /舍曲林/) {
    await openPage(user, '精神药物');
    await user.click(screen.getByRole('button', { name }));
  }

  test('默认选择适用情境并提供五个关联的 Tab 与面板', async () => {
    const { user } = await renderApp();
    await openDrugDetail(user);

    const tablist = screen.getByRole('tablist', { name: '舍曲林内容目录' });
    const tabs = within(tablist).getAllByRole('tab');
    const panels = screen.getAllByRole('tabpanel', { hidden: true });

    expect(tabs.map((tab) => tab.textContent)).toEqual([
      '01适用情境',
      '02药物作用',
      '03药物动力学',
      '04药物联用',
      '05副作用'
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    tabs.slice(1).forEach((tab) => {
      expect(tab).toHaveAttribute('aria-selected', 'false');
      expect(tab).toHaveAttribute('tabindex', '-1');
    });
    expect(panels).toHaveLength(5);
    panels.forEach((panel, index) => {
      expect(tabs[index]).toHaveAttribute('aria-controls', panel.id);
      expect(panel).toHaveAttribute('aria-labelledby', tabs[index].id);
      if (index === 0) expect(panel).not.toHaveAttribute('hidden');
      else expect(panel).toHaveAttribute('hidden');
    });
  });

  test('点击药物作用会切换内容并隐藏不活动面板', async () => {
    const { user } = await renderApp();
    await openDrugDetail(user);

    const actionTab = screen.getByRole('tab', { name: '药物作用' });
    const indicationTab = screen.getByRole('tab', { name: '适用情境' });
    await user.click(actionTab);

    expect(actionTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: '药物作用' })).toHaveTextContent('测试药物作用');
    const indicationPanel = screen.getAllByRole('tabpanel', { hidden: true })
      .find((panel) => panel.id === indicationTab.getAttribute('aria-controls'));
    expect(indicationPanel).toHaveAttribute('hidden');
    expect(screen.getByText('测试警示')).toBeVisible();
  });

  test('点击副作用会显示最新 main 新增的内容分区', async () => {
    const { user } = await renderApp();
    await openDrugDetail(user);

    const sideEffectsTab = screen.getByRole('tab', { name: '副作用' });
    await user.click(sideEffectsTab);

    expect(sideEffectsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: '副作用' })).toHaveTextContent('测试副作用');
    expect(screen.getByText('测试警示')).toBeVisible();
  });

  test('ArrowRight 切换到下一项并移动焦点', async () => {
    const { user } = await renderApp();
    await openDrugDetail(user);

    const firstTab = screen.getByRole('tab', { name: '适用情境' });
    const actionTab = screen.getByRole('tab', { name: '药物作用' });
    firstTab.focus();
    await user.keyboard('{ArrowRight}');

    expect(actionTab).toHaveFocus();
    expect(actionTab).toHaveAttribute('aria-selected', 'true');
  });

  test('ArrowLeft 从第一项反向循环到最后一项', async () => {
    const { user } = await renderApp();
    await openDrugDetail(user);

    const firstTab = screen.getByRole('tab', { name: '适用情境' });
    const lastTab = screen.getByRole('tab', { name: '副作用' });
    firstTab.focus();
    await user.keyboard('{ArrowLeft}');

    expect(lastTab).toHaveFocus();
    expect(lastTab).toHaveAttribute('aria-selected', 'true');
  });

  test('ArrowDown 和 ArrowUp 均可切换并移动焦点', async () => {
    const { user } = await renderApp();
    await openDrugDetail(user);

    const firstTab = screen.getByRole('tab', { name: '适用情境' });
    const actionTab = screen.getByRole('tab', { name: '药物作用' });
    firstTab.focus();
    await user.keyboard('{ArrowDown}');
    expect(actionTab).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(firstTab).toHaveFocus();
    expect(firstTab).toHaveAttribute('aria-selected', 'true');
  });

  test('End 和 Home 可跳转到末项与首项', async () => {
    const { user } = await renderApp();
    await openDrugDetail(user);

    const firstTab = screen.getByRole('tab', { name: '适用情境' });
    const lastTab = screen.getByRole('tab', { name: '副作用' });
    firstTab.focus();
    await user.keyboard('{End}');
    expect(lastTab).toHaveFocus();
    expect(lastTab).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Home}');
    expect(firstTab).toHaveFocus();
    expect(firstTab).toHaveAttribute('aria-selected', 'true');
  });

  test('更换药物词条后重置到第一个分区', async () => {
    const { user } = await renderApp({ storedData: dataWithSecondDrug() });
    await openDrugDetail(user);
    await user.click(screen.getByRole('tab', { name: '药物作用' }));
    expect(screen.getByRole('tab', { name: '药物作用' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('button', { name: /虚构第二药物/ }));

    expect(await screen.findByRole('heading', { name: '虚构第二药物', level: 2 })).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: '适用情境' })).toHaveAttribute('aria-selected', 'true');
    });
    expect(screen.getByRole('tabpanel', { name: '适用情境' })).toHaveTextContent('第二药物适用情境');
  });

  test('reduced-motion 下键盘切换功能不受影响', async () => {
    const { user } = await renderApp({ reducedMotion: true });
    await openDrugDetail(user);

    const firstTab = screen.getByRole('tab', { name: '适用情境' });
    const actionTab = screen.getByRole('tab', { name: '药物作用' });
    firstTab.focus();
    await user.keyboard('{ArrowRight}');

    expect(actionTab).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: '药物作用' })).toHaveTextContent('测试药物作用');
  });
});

describe('生产只读门禁', () => {
  test('生产模式不显示新增按钮', async () => {
    const { user } = await renderApp({ canEdit: false });
    await openPage(user, '疾病科普');
    expect(screen.queryByRole('button', { name: /新增/ })).not.toBeInTheDocument();
  });

  test('生产模式不显示编辑按钮', async () => {
    const { user } = await renderApp({ canEdit: false });
    await openPage(user, '疾病科普');
    await user.click(screen.getByRole('button', { name: /抑郁障碍/ }));
    expect(screen.queryByRole('button', { name: '编辑词条' })).not.toBeInTheDocument();
  });

  test('生产模式不显示删除按钮', async () => {
    const { user } = await renderApp({ canEdit: false });
    await openPage(user, '疾病科普');
    await user.click(screen.getByRole('button', { name: /抑郁障碍/ }));
    expect(screen.queryByRole('button', { name: '删除词条' })).not.toBeInTheDocument();
  });

  test('生产模式不挂载编辑器', async () => {
    await renderApp({ canEdit: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('开发模式允许打开编辑器', async () => {
    const { user } = await renderApp({ canEdit: true });
    await openPage(user, '疾病科普');
    await user.click(screen.getByRole('button', { name: '新增词条' }));
    expect(screen.getByRole('dialog', { name: '编辑词条' })).toBeVisible();
  });
});

describe('本地保存', () => {
  test('保存成功后出现成功提示', async () => {
    const { user } = await renderApp({ canEdit: true });
    await openPage(user, '精神药物');
    await user.click(screen.getByRole('button', { name: '新增词条' }));
    await user.type(screen.getByRole('textbox', { name: '名称' }), '虚构测试药物');
    await user.click(screen.getByRole('button', { name: '保存词条' }));
    expect(await screen.findByText('已保存到本地浏览器')).toBeVisible();
  });

  test('localStorage 写入失败后出现失败提示', async () => {
    seedStoredData();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    const user = userEvent.setup();
    render(<App canEdit />);
    await user.click(screen.getByRole('button', { name: /进入知识库/ }));
    expect(await screen.findByText('本地保存失败，请检查浏览器存储权限或复制当前内容。')).toBeVisible();
  });

  test('写入失败时不显示成功提示', async () => {
    seedStoredData();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    const user = userEvent.setup();
    render(<App canEdit />);
    await user.click(screen.getByRole('button', { name: /进入知识库/ }));
    await openPage(user, '精神药物');
    await user.click(screen.getByRole('button', { name: '新增词条' }));
    await user.type(screen.getByRole('textbox', { name: '名称' }), '虚构测试药物');
    await user.click(screen.getByRole('button', { name: '保存词条' }));
    expect(await screen.findByText('本地保存失败，请检查浏览器存储权限或复制当前内容。')).toBeVisible();
    expect(screen.queryByText('已保存到本地浏览器')).not.toBeInTheDocument();
  });

  test('控制台警告不包含完整数据对象', async () => {
    const data = seedStoredData(createStoredData());
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    const user = userEvent.setup();
    render(<App canEdit />);
    await user.click(screen.getByRole('button', { name: /进入知识库/ }));
    await waitFor(() => expect(warning).toHaveBeenCalled());
    expect(JSON.stringify(warning.mock.calls)).not.toContain(data.cases[0].summary);
  });

  test('删除操作需要确认', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await renderApp({ canEdit: true });
    await openPage(user, '精神药物');
    await user.click(screen.getByRole('button', { name: /舍曲林/ }));
    await user.click(screen.getByRole('button', { name: '删除词条' }));
    expect(confirm).toHaveBeenCalledWith('确定删除“舍曲林”吗？');
  });

  test('用户取消确认时数据不变', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await renderApp({ canEdit: true });
    await openPage(user, '精神药物');
    await user.click(screen.getByRole('button', { name: /舍曲林/ }));
    await user.click(screen.getByRole('button', { name: '删除词条' }));
    expect(screen.getByRole('heading', { name: '舍曲林', level: 2 })).toBeVisible();
  });

  test('有关联案例的疾病删除在普通确认前被阻止且疾病和案例保持不变', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = await renderApp({ canEdit: true });
    const rawBefore = window.localStorage.getItem(STORAGE_KEY);
    await openPage(user, '疾病科普');
    await user.click(screen.getByRole('button', { name: /抑郁障碍/ }));
    await user.click(screen.getByRole('button', { name: '删除词条' }));

    expect(confirm).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '无法删除“抑郁障碍”：仍有 1 个关联案例'
    );
    expect(screen.queryByText('词条已删除')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '抑郁障碍', level: 2 })).toBeVisible();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(rawBefore);

    await openPage(user, '案例分析');
    expect(screen.getByRole('button', { name: /持续低落与早醒案例/ })).toBeVisible();
    await openPage(user, '疾病科普');
    expect(screen.getByRole('button', { name: /抑郁障碍/ })).toBeVisible();
  });

  test('无关联疾病仍走正常确认且用户取消时保持不变', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = await renderApp({
      canEdit: true,
      storedData: dataWithUnrelatedDisorder()
    });
    await openPage(user, '疾病科普');
    await user.click(screen.getByRole('button', { name: /虚构无案例疾病/ }));
    await user.click(screen.getByRole('button', { name: '删除词条' }));

    expect(confirm).toHaveBeenCalledWith('确定删除“虚构无案例疾病”吗？');
    expect(screen.getByRole('heading', { name: '虚构无案例疾病', level: 2 })).toBeVisible();
    expect(screen.queryByText('词条已删除')).not.toBeInTheDocument();
  });

  test('无关联疾病确认后仍可正常删除', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = await renderApp({
      canEdit: true,
      storedData: dataWithUnrelatedDisorder()
    });
    await openPage(user, '疾病科普');
    await user.click(screen.getByRole('button', { name: /虚构无案例疾病/ }));
    await user.click(screen.getByRole('button', { name: '删除词条' }));

    expect(await screen.findByText('词条已删除')).toBeVisible();
    expect(screen.queryByRole('button', { name: /虚构无案例疾病/ })).not.toBeInTheDocument();
  });

  test('无效自动备份恢复不显示成功提示', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { user } = await renderApp({
      canEdit: true,
      beforeRender() {
        window.localStorage.setItem(
          'symgene-wiki-backup-9999-12-31T23-59-59.999Z',
          '{broken'
        );
      }
    });
    await user.click(screen.getByRole('button', { name: '本地数据' }));
    await user.click(screen.getAllByRole('button', { name: '恢复' })[0]);

    expect(await screen.findByText('备份恢复失败，当前数据未改变。')).toBeVisible();
    expect(screen.queryByText('本地备份已恢复')).not.toBeInTheDocument();
  });
});
