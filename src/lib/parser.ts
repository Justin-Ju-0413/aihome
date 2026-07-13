import matter from 'gray-matter';

export interface ParsedAgentContent {
  name: string | null;
  description: string | null;
  sections: Array<{ title: string; content: string }>;
}

export interface ParsedSkillContent {
  frontmatter: Record<string, unknown>;
  body: string;
  name: string | null;
  description: string | null;
}

export function parseAgentsMd(content: string): ParsedAgentContent {
  const lines = content.split('\n');
  let name: string | null = null;
  let description: string | null = null;
  const sections: Array<{ title: string; content: string }> = [];
  
  let currentSection: { title: string; content: string[] } | null = null;
  let descCollected = false;

  for (const line of lines) {
    // Extract first H1 as name
    if (!name && line.match(/^#\s+/)) {
      name = line.replace(/^#\s+/, '').trim();
      continue;
    }

    // Collect description (first non-empty paragraph after H1)
    if (name && !descCollected && !line.match(/^#/)) {
      const trimmed = line.trim();
      if (trimmed) {
        description = description ? `${description} ${trimmed}` : trimmed;
      } else if (description) {
        descCollected = true;
      }
      continue;
    }

    // Extract sections
    if (line.match(/^##\s+/)) {
      if (currentSection) {
        sections.push({
          title: currentSection.title,
          content: currentSection.content.join('\n').trim()
        });
      }
      currentSection = {
        title: line.replace(/^##\s+/, '').trim(),
        content: []
      };
    } else if (currentSection) {
      currentSection.content.push(line);
    }
  }

  if (currentSection) {
    sections.push({
      title: currentSection.title,
      content: currentSection.content.join('\n').trim()
    });
  }

  // Truncate description
  if (description && description.length > 300) {
    description = description.slice(0, 297) + '...';
  }

  return { name, description, sections };
}

export function parseSkillMd(content: string): ParsedSkillContent {
  const { data, content: body } = matter(content);
  
  const name = data.name || extractFirstHeading(body);
  const description = data.description || extractFirstParagraph(body);

  return {
    frontmatter: data,
    body,
    name,
    description
  };
}

export function serializeSkillMd(frontmatter: Record<string, unknown>, body: string): string {
  return matter.stringify(body, frontmatter);
}

function extractFirstHeading(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractFirstParagraph(content: string): string | null {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
      return trimmed.slice(0, 200);
    }
  }
  return null;
}
