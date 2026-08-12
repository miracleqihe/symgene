import React from 'react';
import axe from 'axe-core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  data: {
    drugs: [{
      id: 'sertraline',
      name: '测试药物',
      aliases: 'Test drug',
      section: '测试章节',
      categoryLabel: '测试分类',
      className: '测试药物分类',
      classOrder: 1,
      indication: '测试适用情境',
      action: '测试药物作用',
      kinetics: '测试药物动力学',
      interactions: '测试药物联用',
      sideEffects: '测试副作用',
      contraindications: '测试禁忌与警示',
      source: '公开测试来源'
    }],
    disorders: [{
      id: 'depression',
      name: '测试疾病',
      aliases: ['测试别名'],
      category: '心境障碍',
      summary: '持续疲惫并且早醒。',
      details: '测试疾病详情。',
      symptoms: ['持续疲惫', '早醒'],
      patientPhrases: ['最近持续疲惫'],
      courseClues: ['持续两周以上'],
      functionalImpact: ['工作效率下降'],
      assessment: ['持续时间'],
      differentials: ['睡眠问题'],
      treatmentOverview: ['寻求专业评估'],
      emergencySignals: ['急性风险'],
      relatedDrugIds: ['sertraline'],
      source: '公开测试来源'
    }],
    cases: [{
      id: 'case-depression',
      disorderId: 'depression',
      title: '测试案例',
      stage: '初步评估',
      tags: ['持续疲惫'],
      summary: '持续疲惫案例。',
      presentation: ['早醒'],
      timeline: '持续三个月',
      functionImpact: '工作效率下降',
      riskSignals: '当前无急性风险',
      assessmentFocus: ['睡眠变化'],
      differentialClues: ['躯体因素'],
      safetyNote: '必要时寻求专业帮助',
      source: '公开测试来源'
    }],
    resources: [{
      id: 'resource-public',
      kind: '网站',
      title: '公开测试资源',
      description: '公开网络资源。',
      url: 'https://example.com/mental-health',
      source: '示例机构'
    }]
  }
}));

vi.mock('../../src/hooks/useLocalKnowledge.js', () => ({
  useLocalKnowledge: () => ({
    data: fixture.data,
    removeEntry: () => true,
    saveEntry: () => true,
    storageError: ''
  })
}));

vi.mock('../../src/components/HeroLightField', () => ({ default: () => null }));
vi.mock('../../src/components/PaperPlaneLetter', () => ({
  default: () => <button type="button" aria-label="打开欢迎信">欢迎信</button>
}));
vi.mock('../../src/components/KineticTitle', async () => {
  const ReactModule = await import('react');
  return {
    default: ({ as = 'h1', text }) => ReactModule.createElement(as, null, text)
  };
});

import { App } from '../../src/main.jsx';

function mockMedia({ mobile = false, reducedMotion = true } = {}) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)'
      ? reducedMotion
      : (query === '(max-width: 780px)' && mobile),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

async function renderApp(options = {}) {
  mockMedia(options);
  const user = userEvent.setup();
  const result = render(<App canEdit={options.canEdit ?? false} />);
  return { user, ...result };
}

async function openFromHome(user, pageName) {
  await user.click(screen.getByRole('button', { name: '栏目' }));
  await user.click(
    within(screen.getByRole('navigation', { name: '知识栏目' }))
      .getByRole('button', { name: pageName })
  );
}

async function expectNoSeriousAxeViolations(container) {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } }
  });
  expect(
    result.violations
      .filter((violation) => ['critical', 'serious'].includes(violation.impact))
      .map((violation) => violation.id)
  ).toEqual([]);
}

describe('safety UI gate', () => {
  test('当前“想死”显示 critical alert 并抑制疾病、案例和关联药物结果', async () => {
    const { user, container } = await renderApp();
    await user.type(
      screen.getByRole('textbox', { name: '描述你正在经历的情况' }),
      '我现在想死，同时持续疲惫'
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('risk-banner', 'critical');
    expect(alert).toHaveTextContent('自伤/自杀风险');
    expect(screen.queryByText('可能相关的疾病线索')).not.toBeInTheDocument();
    expect(screen.queryByText('相似案例')).not.toBeInTheDocument();
    expect(screen.queryByText('关联治疗与药物资料')).not.toBeInTheDocument();
    await expectNoSeriousAxeViolations(container);
  });

  test('第三人称假设显示 guidance status 并保留普通结果', async () => {
    const { user, container } = await renderApp();
    await user.type(
      screen.getByRole('textbox', { name: '描述你正在经历的情况' }),
      '如果有人想自杀应该怎么办，同时持续疲惫'
    );

    const status = screen.getByRole('status');
    expect(status).toHaveClass('risk-banner', 'guidance');
    expect(status).toHaveTextContent('若危险正在发生');
    expect(screen.getByText('可能相关的疾病线索')).toBeInTheDocument();
    await expectNoSeriousAxeViolations(container);
  });

  test('否定的自杀片段不会掩盖同句已经发生的吞药风险', async () => {
    const { user } = await renderApp();
    await user.type(
      screen.getByRole('textbox', { name: '描述你正在经历的情况' }),
      '我没有自杀想法，但是刚刚吞了几十片安眠药'
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('risk-banner', 'critical');
    expect(alert).toHaveTextContent('急性躯体/中毒风险');
    expect(alert).not.toHaveTextContent('自伤/自杀风险');
  });
});

describe('search and page focus', () => {
  test('从首页栏目进入知识页后，焦点跟随到新页面标题区', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('button', { name: '栏目' }));
    await user.click(
      within(screen.getByRole('navigation', { name: '知识栏目' }))
        .getByRole('button', { name: '疾病科普' })
    );

    const heading = await screen.findByRole('heading', { name: '疾病科普', level: 1 });
    const header = heading.closest('.page-header');
    await waitFor(() => expect(header).toHaveFocus());
  });

  test('从搜索结果进入详情后，焦点跟随到详情返回按钮', async () => {
    const { user } = await renderApp();
    await user.type(
      screen.getByRole('textbox', { name: '描述你正在经历的情况' }),
      '持续疲惫'
    );
    await user.click(screen.getByRole('button', { name: /测试疾病/ }));

    const back = await screen.findByRole('button', { name: '返回列表' });
    await waitFor(() => expect(back).toHaveFocus());
    await user.click(back);
    const indexTrigger = await screen.findByRole('button', { name: /测试疾病/ });
    await waitFor(() => expect(indexTrigger).toHaveFocus());
  });

  test('移动导航关闭隐藏前把焦点移到目标页面', async () => {
    const { user } = await renderApp({ mobile: true });
    await user.click(screen.getByRole('button', { name: '打开导航' }));
    await user.click(
      within(screen.getByRole('navigation', { name: '主导航' }))
        .getByRole('button', { name: /疾病科普/ })
    );

    const heading = await screen.findByRole('heading', { name: '疾病科普', level: 1 });
    await waitFor(() => expect(heading.closest('.page-header')).toHaveFocus());

    await user.click(screen.getByRole('button', { name: '打开导航' }));
    await user.click(
      within(screen.getByRole('navigation', { name: '主导航' }))
        .getByRole('button', { name: /疾病科普/ })
    );
    await waitFor(() => expect(screen.getByRole('button', { name: '打开导航' })).toHaveFocus());

    await user.click(screen.getByRole('button', { name: '打开导航' }));
    await user.click(
      within(screen.getByRole('navigation', { name: '主导航' }))
        .getByRole('button', { name: /^首页/ })
    );
    await waitFor(() => expect(screen.getByRole('textbox', { name: '描述你正在经历的情况' })).toHaveFocus());

    const menuToggle = screen.getByRole('button', { name: '打开导航' });
    await user.click(menuToggle);
    const scrim = screen.getAllByRole('button', { name: '关闭导航' })
      .find((button) => button.classList.contains('nav-scrim'));
    await user.click(scrim);
    await waitFor(() => expect(menuToggle).toHaveFocus());
  });

  test('正常动画下从药物页按 Ctrl+K 会在首页挂载后聚焦搜索框', async () => {
    const { user } = await renderApp({ reducedMotion: false });
    await openFromHome(user, '精神药物');
    await screen.findByRole('heading', { name: '精神药物', level: 1 });

    await user.keyboard('{Control>}k{/Control}');

    await waitFor(
      () => expect(screen.getByRole('textbox', { name: '描述你正在经历的情况' })).toHaveFocus(),
      { timeout: 1500 }
    );
  });
});

describe('production read-only boundary', () => {
  test('公开模式的目录、详情和案例均不渲染写入口或编辑器', async () => {
    const { user, container } = await renderApp({ canEdit: false });
    await openFromHome(user, '疾病科普');
    await screen.findByRole('heading', { name: '疾病科普', level: 1 });
    expect(container.querySelector('.local-add-button')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /测试疾病/ }));
    expect(screen.queryByRole('button', { name: '编辑词条' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除词条' })).not.toBeInTheDocument();

    const navigation = screen.getByRole('navigation', { name: '主导航' });
    await user.click(within(navigation).getByRole('button', { name: /案例分析/ }));
    await screen.findByRole('heading', { name: '案例分析', level: 1 });
    expect(screen.queryByRole('button', { name: '编辑案例' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除案例' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '编辑词条' })).not.toBeInTheDocument();
    expect(screen.getByText('公开阅读模式')).toBeInTheDocument();
  });
});

describe('editor dialog keyboard and focus', () => {
  test('新增与编辑流程使用各自可见标题作为 dialog 名称', async () => {
    const { user } = await renderApp({ canEdit: true });
    await openFromHome(user, '疾病科普');
    await user.click(await screen.findByRole('button', { name: /测试疾病/ }));
    await user.click(screen.getByRole('button', { name: '编辑词条' }));
    expect(screen.getByRole('dialog', { name: '编辑词条' })).toBeInTheDocument();
  });

  test('焦点进入并循环，Escape 关闭后恢复触发按钮', async () => {
    const { user, container } = await renderApp({ canEdit: true });
    await openFromHome(user, '疾病科普');
    const trigger = await screen.findByRole('button', { name: '新增词条' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: '新增词条' });
    const close = screen.getByRole('button', { name: '关闭' });
    const save = screen.getByRole('button', { name: '保存词条' });
    expect(close).toHaveFocus();
    expect(container.querySelector('.layout')).toHaveAttribute('inert');

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(save).toHaveFocus();
    await user.keyboard('{Tab}');
    expect(close).toHaveFocus();
    expect(dialog).toContainElement(document.activeElement);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '新增词条' })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(container.querySelector('.layout')).not.toHaveAttribute('inert');
  });

  test('新增按钮支持 Enter 和 Space 的原生键盘激活', async () => {
    const { user } = await renderApp({ canEdit: true });
    await openFromHome(user, '疾病科普');
    const trigger = await screen.findByRole('button', { name: '新增词条' });

    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: '新增词条' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.keyboard(' ');
    expect(screen.getByRole('dialog', { name: '新增词条' })).toBeInTheDocument();
  });

  test('取消、保存和点击遮罩关闭后都恢复触发按钮焦点', async () => {
    const { user } = await renderApp({ canEdit: true });
    await openFromHome(user, '疾病科普');
    const trigger = await screen.findByRole('button', { name: '新增词条' });

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: '保存词条' }));
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '新增词条' });
    fireEvent.mouseDown(dialog.parentElement);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test('正常退出动画期间背景保持 inert，卸载后才恢复焦点和交互', async () => {
    const { user, container } = await renderApp({ canEdit: true, reducedMotion: false });
    await openFromHome(user, '疾病科普');
    const trigger = await screen.findByRole('button', { name: '新增词条' });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: '新增词条' });

    await user.keyboard('{Escape}');
    expect(container.querySelector('.layout')).toHaveAttribute('inert');
    await waitFor(
      () => expect(screen.queryByRole('dialog', { name: '新增词条' })).not.toBeInTheDocument(),
      { timeout: 1000 }
    );
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(container.querySelector('.layout')).not.toHaveAttribute('inert');
  });
});

describe('mobile detail focus', () => {
  test('进入药物详情后聚焦返回按钮，返回后恢复原词条', async () => {
    const { user } = await renderApp({ mobile: true });
    await openFromHome(user, '精神药物');
    const trigger = await screen.findByRole('button', { name: /测试药物/ });
    await user.click(trigger);

    const back = await screen.findByRole('button', { name: '返回列表' });
    await waitFor(() => expect(back).toHaveFocus());
    await user.click(back);
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test('进入案例详情后聚焦返回按钮，返回后恢复原案例', async () => {
    const { user } = await renderApp({ mobile: true });
    await openFromHome(user, '案例分析');
    const trigger = await screen.findByRole('button', { name: /测试案例/ });
    await user.click(trigger);

    const back = await screen.findByRole('button', { name: '返回案例列表' });
    await waitFor(() => expect(back).toHaveFocus());
    await user.click(back);
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

describe('axe baseline', () => {
  test('首页、目录和编辑器没有 critical 或 serious violations', async () => {
    const { user, container } = await renderApp({ canEdit: true });
    await expectNoSeriousAxeViolations(container);
    await openFromHome(user, '疾病科普');
    await screen.findByRole('heading', { name: '疾病科普', level: 1 });
    await expectNoSeriousAxeViolations(container);
    await user.click(screen.getByRole('button', { name: '新增词条' }));
    await expectNoSeriousAxeViolations(container);
  });
});
