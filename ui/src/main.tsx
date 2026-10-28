import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { initializeAppearance, initializeApplication } from './bootstrap';

// Hide the WebView's browser menu without blocking Gitma's own context menus.
document.addEventListener('contextmenu', (event) => event.preventDefault(), true);

// Apply saved theme & language synchronously before first render to prevent FOUC/theme blink.
initializeAppearance();

createRoot(document.getElementById('root')!).render(<App />);
void initializeApplication().catch((error) => console.error('Falha na inicialização do Gitma', error));
