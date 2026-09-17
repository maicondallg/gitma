import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { initializeApplication } from './bootstrap';

createRoot(document.getElementById('root')!).render(<App />);
void initializeApplication().catch((error) => console.error('Falha na inicialização do Gitma', error));
