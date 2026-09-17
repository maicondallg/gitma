import { describe, expect, it, beforeEach } from 'vitest';
import {
  SUPPORTED_LOCALES,
  getLanguage,
  setLanguage,
  t,
} from './index';

describe('i18n Engine', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
    setLanguage('pt-BR');
  });

  it('provides supported locales pt-BR, en-US, es', () => {
    expect(SUPPORTED_LOCALES.map((l) => l.code)).toContain('pt-BR');
    expect(SUPPORTED_LOCALES.map((l) => l.code)).toContain('en-US');
    expect(SUPPORTED_LOCALES.map((l) => l.code)).toContain('es');
  });

  it('stores and updates locale in localStorage and document lang', () => {
    setLanguage('pt-BR');
    expect(getLanguage()).toBe('pt-BR');
    expect(document.documentElement.getAttribute('lang')).toBe('pt-BR');

    setLanguage('es');
    expect(getLanguage()).toBe('es');
    expect(document.documentElement.getAttribute('lang')).toBe('es');

    setLanguage('en-US');
    expect(getLanguage()).toBe('en-US');
    expect(document.documentElement.getAttribute('lang')).toBe('en-US');
  });

  it('translates nested keys across supported locales with fallback', () => {
    setLanguage('en-US');
    expect(t('settings.title')).toBe('Settings');
    expect(t('clone.title')).toBe('Clone Repository');
    expect(t('init.title')).toBe('Initialize New Local Repository');

    setLanguage('pt-BR');
    expect(t('settings.title')).toBe('Configurações');
    expect(t('clone.title')).toBe('Clonar Repositório');
    expect(t('init.title')).toBe('Inicializar Novo Repositório Local');

    setLanguage('es');
    expect(t('settings.title')).toBe('Configuración');
    expect(t('clone.title')).toBe('Clonar Repositorio');
    expect(t('init.title')).toBe('Inicializar Nuevo Repositorio Local');
  });

  it('interpolates {param} and {{param}} correctly in translation strings', () => {
    setLanguage('en-US');
    const result = t('app.tabsOpen', { count: 3 });
    expect(result).toBe('3 tab(s) open');

    setLanguage('pt-BR');
    const resultPt = t('app.tabsOpen', { count: 5 });
    expect(resultPt).toBe('5 aba(s) aberta(s)');


    // Fallback and custom interpolations
    const fallbackWithParam = t('custom.missing {param}', { param: 'test' });
    expect(fallbackWithParam).toBe('custom.missing test');
  });
});
