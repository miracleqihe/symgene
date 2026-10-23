import React from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi } from 'vitest';
import KnowledgeReading from '../../src/components/KnowledgeReading.jsx';

const drug={id:'example-drug',name:'示例药物'};
const disease={id:'example-disorder',name:'示例疾病',relatedDrugIds:[drug.id]};
const caseItem={id:'case-example',title:'虚构的练习故事',disorderId:disease.id};
const data={drugs:[drug],disorders:[disease],cases:[caseItem]};

describe('public reading materials',()=>{
  test('related entries open the actual linked disease, drug and case',async()=>{
    const onOpen=vi.fn();
    render(<KnowledgeReading type="disorders" item={disease} data={data} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button',{name:/示例药物/}));
    expect(onOpen).toHaveBeenCalledWith('drugs',drug);
    await userEvent.click(screen.getByRole('button',{name:/虚构的练习故事/}));
    expect(onOpen).toHaveBeenCalledWith('cases',caseItem);
    expect(screen.queryByText(/候选证据|待核问题|审校进度/)).not.toBeInTheDocument();
  });
  test('dialog traps focus, closes with Escape and restores its trigger',async()=>{
    const user=userEvent.setup();
    render(<KnowledgeReading type="drugs" item={drug} data={data} position="before" />);
    const trigger=screen.getByRole('button',{name:/教学 Prompt/});
    await user.click(trigger);
    const dialog=screen.getByRole('dialog');
    const close=within(dialog).getByRole('button',{name:'关闭教学材料'});
    expect(close).toHaveFocus();
    await user.tab({shift:true});
    expect(within(dialog).getByRole('button',{name:'复制完整材料'})).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  test('clipboard failure leaves selectable text and does not claim success',async()=>{
    const writeText=vi.fn().mockRejectedValue(new Error('clipboard unavailable'));
    Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true});
    render(<KnowledgeReading type="drugs" item={drug} data={data} position="before" />);
    fireEvent.click(screen.getByRole('button',{name:/教学 Prompt/}));
    fireEvent.click(screen.getByRole('button',{name:'复制完整材料'}));
    await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('未能自动复制'));
    expect(screen.getByRole('status')).not.toHaveTextContent('已复制');
    expect(screen.getByLabelText('完整教学材料').value).toContain('不要替我诊断');
  });
});
