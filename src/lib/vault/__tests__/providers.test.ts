import { describe, it, expect } from 'vitest';
import { PROVIDER_TEMPLATES, validateProviderInput } from '../providers';

describe('provider templates', () => {
  it('exposes the 6 built-in templates with ids and urls', () => {
    const ids = PROVIDER_TEMPLATES.map((p) => p.id);
    expect(ids).toEqual([
      'anthropic', 'openai', 'deepseek', 'volcengine-coding', 'glm', 'kimi',
    ]);
    const volc = PROVIDER_TEMPLATES.find((p) => p.id === 'volcengine-coding')!;
    expect(volc.baseUrl).toBe('https://ark.cn-beijing.volces.com/api/coding/v3');
    expect(volc.model).toBe('ark-code-latest');
  });
});

describe('validateProviderInput', () => {
  it('accepts valid input', () => {
    expect(validateProviderInput({ name: 'X', baseUrl: 'https://x.com', model: 'm', apiKey: 'sk-abcdef123456' })).toBeNull();
  });
  it('rejects empty name', () => {
    expect(validateProviderInput({ name: '', baseUrl: 'https://x.com', model: 'm', apiKey: 'sk-abc' })).toContain('name');
  });
  it('rejects non-http baseUrl', () => {
    expect(validateProviderInput({ name: 'X', baseUrl: 'ftp://x', model: 'm', apiKey: 'sk-abc' })).toContain('baseUrl');
  });
  it('rejects empty model', () => {
    expect(validateProviderInput({ name: 'X', baseUrl: 'https://x.com', model: '', apiKey: 'sk-abc' })).toContain('model');
  });
  it('rejects short apiKey', () => {
    expect(validateProviderInput({ name: 'X', baseUrl: 'https://x.com', model: 'm', apiKey: 'abc' })).toContain('apiKey');
  });
});
