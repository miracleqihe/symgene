import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.jsx';
import './styles.css';

const rootElement = document.getElementById('root');
if (rootElement) createRoot(rootElement).render(<App />);
