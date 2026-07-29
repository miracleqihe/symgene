import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { App } from '../../src/main.jsx';
import { createStoredData, seedStoredData } from './fixtures.js';

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
});
