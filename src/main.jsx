import './responsive.css';
import './theme.css';
import './glass.css';
import './cristal2.css'; // R86 · cristal 2.0
import './cloudBridge';
import {iniciarPWA,registroDeEquipo} from './pwa.js';
import {applyPalette,savedPalette} from './palettes.mjs';
applyPalette(savedPalette());
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
iniciarPWA();registroDeEquipo();
