import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { setLanguage } from './i18n';

beforeEach(() => {
  setLanguage('pt-BR');
});
