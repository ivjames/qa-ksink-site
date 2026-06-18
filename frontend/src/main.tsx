import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const rootElement = window.document.querySelector('#root');

if (!rootElement) {
  throw new Error('Root element missing');
}

ReactDOM.createRoot(rootElement).render(<App />);
