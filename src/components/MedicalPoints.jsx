import React from 'react';
import { medicalPoints } from '../content/medicalText';

export default function MedicalPoints({ text }) {
  const points=medicalPoints(text || '待补充');
  return <ul className="medical-points">{points.map((point,index)=><li key={index}>{point}</li>)}</ul>;
}
