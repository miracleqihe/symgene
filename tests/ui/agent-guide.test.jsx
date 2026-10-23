import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi } from 'vitest';
import AgentGuideEntry from '../../src/components/AgentGuideEntry.jsx';

describe('public Agent guide entry', () => {
  test('home guide copies the global instructions, links all modules and restores keyboard focus', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<AgentGuideEntry />);
    const trigger = screen.getByRole('button', { name: '全局 Agent · 一起读懂' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: '全局 Agent 指南' });
    expect(within(dialog).getByRole('navigation', { name: '分模块 Agent 指南' }).querySelectorAll('a')).toHaveLength(6);
    expect(within(dialog).getByLabelText('完整教学材料').value).not.toMatch(/教材|书籍|Kaplan|实施方案/);
    expect(within(dialog).getByText(/可以独立使用；需要更多资料时/)).toBeInTheDocument();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: '复制完整材料' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: '复制完整材料' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('中国大陆读者'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('没有联网或不能打开链接时，仍可倾听、整理问题'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test('a module guide includes only its task and keeps global boundaries', async () => {
    const user = userEvent.setup();
    render(<AgentGuideEntry moduleId="cases" />);
    await user.click(screen.getByRole('button', { name: 'AI 讲解指南' }));
    const dialog = screen.getByRole('dialog', { name: '案例分析 · AI 讲解指南' });
    const prompt = within(dialog).getByLabelText('完整教学材料').value;
    expect(prompt).toContain('## 当前模块：案例分析');
    expect(prompt).toContain('明确不同说话人的身份');
    expect(prompt).toContain('不要替我诊断、按症状选药');
    expect(prompt).not.toContain('## 当前模块：精神药物');
    expect(within(dialog).getByRole('link', { name: '打开 Markdown 指南' })).toHaveAttribute('href', '/agent/modules/cases.md');
  });
});
