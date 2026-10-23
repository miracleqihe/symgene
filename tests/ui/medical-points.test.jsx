import React from 'react';
import { render,screen } from '@testing-library/react';
import { test,expect } from 'vitest';
import MedicalPoints from '../../src/components/MedicalPoints.jsx';

test('renders manual and supplemented medical notes as points without duplicated markers or altered values',()=>{
  render(<MedicalPoints text={'• 口干：可影响日常生活。\r\n\n- 血药浓度：13～88。\n-2 是示例数值，不能丢失负号。'} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getByText('口干：可影响日常生活。')).toBeInTheDocument();
  expect(screen.getByText('血药浓度：13～88。')).toBeInTheDocument();
  expect(screen.getByText('-2 是示例数值，不能丢失负号。')).toBeInTheDocument();
});
