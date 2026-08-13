import { describe, it, expect } from 'vitest';
import { parseAgentsMd, parseSkillMd, serializeSkillMd } from '../parser';

describe('parseAgentsMd', () => {
  it('extracts first H1 as name and first paragraph as description', () => {
    const parsed = parseAgentsMd('# My Agent\n\nThis is the description.\n\n## Dependencies\n- foo');
    expect(parsed.name).toBe('My Agent');
    expect(parsed.description).toBe('This is the description.');
    expect(parsed.sections).toEqual([{ title: 'Dependencies', content: '- foo' }]);
  });

  it('joins multi-line description paragraphs', () => {
    const parsed = parseAgentsMd('# A\n\nline one\nline two\n\n## S\nbody');
    expect(parsed.description).toBe('line one line two');
    expect(parsed.sections).toEqual([{ title: 'S', content: 'body' }]);
  });

  it('truncates description over 300 chars', () => {
    const long = 'x'.repeat(400);
    const parsed = parseAgentsMd(`# A\n\n${long}`);
    expect(parsed.description!.length).toBe(300);
    expect(parsed.description!.endsWith('...')).toBe(true);
  });

  it('keeps description empty when H1 is directly followed by a section', () => {
    const parsed = parseAgentsMd('# A\n## Dependencies\n- b\n');
    expect(parsed.description).toBeNull();
    expect(parsed.sections).toEqual([{ title: 'Dependencies', content: '- b' }]);
  });

  it('handles multiple sections and empty file', () => {
    const parsed = parseAgentsMd('# A\n\nintro\n\n## One\nx\n\n## Two\ny');
    expect(parsed.sections.map((s) => s.title)).toEqual(['One', 'Two']);
    expect(parseAgentsMd('').name).toBeNull();
    expect(parseAgentsMd('').description).toBeNull();
  });

  it('trims whitespace around H1 and ignores H2 as name', () => {
    const parsed = parseAgentsMd('#  Padded Name  \n\nbody');
    expect(parsed.name).toBe('Padded Name');
    // H2（##）不构成 name
    expect(parseAgentsMd('## Not A Name\n\nbody').name).toBeNull();
  });
});

describe('parseSkillMd / serializeSkillMd', () => {
  const SKILL = `---
name: My Skill
description: Skill desc
version: "1.0"
---

# Usage

body here
`;

  it('reads frontmatter name/description', () => {
    const parsed = parseSkillMd(SKILL);
    expect(parsed.name).toBe('My Skill');
    expect(parsed.description).toBe('Skill desc');
    expect(parsed.frontmatter.version).toBe('1.0');
    expect(parsed.body).toContain('# Usage');
  });

  it('falls back to body heading/paragraph when frontmatter missing', () => {
    const parsed = parseSkillMd('# Body Name\n\nBody desc text.');
    expect(parsed.name).toBe('Body Name');
    expect(parsed.description).toBe('Body desc text.');
    expect(Object.keys(parsed.frontmatter)).toHaveLength(0);
  });

  it('round-trips through serializeSkillMd', () => {
    const parsed = parseSkillMd(SKILL);
    const out = serializeSkillMd(parsed.frontmatter, parsed.body);
    expect(parseSkillMd(out).name).toBe('My Skill');
    expect(parseSkillMd(out).description).toBe('Skill desc');
    expect(out).toContain('name: My Skill');
    expect(out).toContain('# Usage');
  });
});
