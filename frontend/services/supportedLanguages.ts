import { Language, LANGUAGES } from '../types';

export type SupportedLanguages = {
  limited: boolean;
  sources: string[];
  targetsBySource: Record<string, string[]>;
};

const EMPTY_SUPPORTED: SupportedLanguages = {
  limited: false,
  sources: [],
  targetsBySource: {}
};

const resolveBaseUrl = () => {
  const envBase = (import.meta as any).env?.VITE_BACKEND_URL as string | undefined;
  return (envBase || 'http://localhost:8000').replace(/\/$/, '');
};

export const fetchSupportedLanguages = async (): Promise<SupportedLanguages> => {
  try {
    const response = await fetch(`${resolveBaseUrl()}/supported-languages`);
    if (!response.ok) {
      return EMPTY_SUPPORTED;
    }
    const data = (await response.json()) as SupportedLanguages;
    if (!data || typeof data.limited !== 'boolean') {
      return EMPTY_SUPPORTED;
    }
    return data;
  } catch {
    return EMPTY_SUPPORTED;
  }
};

export const resolveLanguageByCode = (code?: string): Language | null => {
  if (!code) return null;
  return LANGUAGES.find((lang) => lang.code === code) ?? { code, name: code };
};

export const filterSourceLanguages = (
  supported: SupportedLanguages,
  all: Language[] = LANGUAGES
) => {
  if (!supported.limited || supported.sources.length === 0) return all;
  return all.filter((lang) => supported.sources.includes(lang.code));
};

export const filterTargetLanguages = (
  sourceCode: string,
  supported: SupportedLanguages,
  all: Language[] = LANGUAGES
) => {
  if (!supported.limited) return all;
  const targets = supported.targetsBySource[sourceCode];
  if (!targets || targets.length === 0) return all;
  return all.filter((lang) => targets.includes(lang.code));
};
