import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { initializeApplication } from './bootstrap';

// Hide the WebView's browser menu without blocking Gitma's own context menus.
document.addEventListener('contextmenu', (event) => event.preventDefault(), true);

createRoot(document.getElementById('root')!).render(<App />);
void initializeApplication().catch((error) => console.error('Falha na inicialização do Gitma', error));
