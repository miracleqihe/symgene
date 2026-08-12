import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

vi.mock('@remotion/player', async () => {
  const ReactModule = await import('react');
  const Player = ReactModule.forwardRef(function MockPlayer(_props, ref) {
    ReactModule.useImperativeHandle(ref, () => ({
      pause: () => {},
      seekTo: () => {}
    }));
    return <div aria-hidden="true" />;
  });
  return { Player };
});

vi.mock('../../src/components/PaperPlaneComposition', () => ({ default: () => null }));

import PaperPlaneLetter from '../../src/components/PaperPlaneLetter.jsx';

function mockReducedMotion(reduced) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query === '(prefers-reduced-motion: reduce)' && reduced,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

test('欢迎信支持键盘打开、焦点循环、Escape 关闭和焦点恢复', async () => {
  mockReducedMotion(true);
  const user = userEvent.setup();
  render(<PaperPlaneLetter />);
  const trigger = screen.getByRole('button', { name: '展开纸飞机，打开一封给来到这里的信' });

  trigger.focus();
  await user.keyboard('{Enter}');
  const dialog = await screen.findByRole('dialog', { name: '你好，欢迎来到心鉴。' }, { timeout: 1500 });
  const close = await screen.findByRole('button', { name: '关闭信件' });
  await waitFor(() => expect(close).toHaveFocus(), { timeout: 1500 });
  expect(dialog).toContainElement(close);

  await user.keyboard('{Tab}');
  expect(close).toHaveFocus();
  await user.keyboard('{Shift>}{Tab}{/Shift}');
  expect(close).toHaveFocus();

  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '你好，欢迎来到心鉴。' })).not.toBeInTheDocument(), { timeout: 1500 });
  await waitFor(() => expect(trigger).toHaveFocus(), { timeout: 1500 });
});

test('正常打开动画尚未完成时也能约束焦点并用 Escape 取消', async () => {
  mockReducedMotion(false);
  const user = userEvent.setup();
  render(<PaperPlaneLetter />);
  const trigger = screen.getByRole('button', { name: '展开纸飞机，打开一封给来到这里的信' });

  await user.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: '你好，欢迎来到心鉴。' });
  await waitFor(() => expect(dialog).toHaveFocus());
  await user.keyboard('{Tab}');
  expect(dialog).toHaveFocus();

  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '你好，欢迎来到心鉴。' })).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
});

test('正常关闭动画期间焦点留在 dialog，结束后恢复触发按钮', async () => {
  mockReducedMotion(false);
  let animationTime = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => window.setTimeout(() => {
    animationTime += 100;
    callback(animationTime);
  }, 5));
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((handle) => window.clearTimeout(handle));
  const user = userEvent.setup();
  const { container } = render(<PaperPlaneLetter />);
  const trigger = screen.getByRole('button', { name: '展开纸飞机，打开一封给来到这里的信' });

  await user.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: '你好，欢迎来到心鉴。' });
  await waitFor(
    () => expect(container.querySelector('.paper-plane-letter')).toHaveAttribute('data-phase', 'opened'),
    { timeout: 1500 }
  );
  await waitFor(() => expect(screen.getByRole('button', { name: '关闭信件' })).toHaveFocus());

  await user.keyboard('{Escape}');
  expect(container.querySelector('.paper-plane-letter')).toHaveAttribute('data-phase', 'closing');
  await waitFor(() => expect(dialog).toHaveFocus());
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '你好，欢迎来到心鉴。' })).not.toBeInTheDocument(), { timeout: 1500 });
  await waitFor(() => expect(trigger).toHaveFocus());
}, 3000);
