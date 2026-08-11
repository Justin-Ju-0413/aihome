import { randomUUID } from 'crypto';
import { stmts } from './db';

/** Agent 模板系统（原 templates.js 移植，含 6 个内置模板） */

export interface Template {
  id: string;
  name: string;
  provider: string;
  description: string;
  prompt: string;
  steps: string[];
  variables: string[];
  category: string;
  created_at: string;
}

const BUILTIN_TEMPLATES = [
  {
    id: 'tpl-paper-review',
    name: '论文结构诊断',
    provider: 'claude',
    description: '对学术论文进行结构完整性诊断，输出JSON格式报告',
    prompt: '你是一位{{学科}}领域的资深审稿人，具有顶级期刊10年审稿经验。\n\n对以下论文执行结构诊断：\n- 检查摘要-引言-方法-结果-讨论的完整性\n- 标记每节字数与推荐范围偏差\n- 输出JSON格式诊断结果\n- 引用格式遵循{{引用风格:APA}}\n\n输入文件：{{文件路径}}',
    steps: ['读取论文文件', '识别章节结构', '诊断各节完整性', '输出JSON报告'],
    variables: ['学科', '引用风格', '文件路径'],
    category: 'paper',
  },
  {
    id: 'tpl-paper-refine',
    name: '论文逐节精修',
    provider: 'claude',
    description: '对论文章节逐个精修，标注修改前后对比',
    prompt: '你是一位{{学科}}领域的学术写作专家。\n\n对 {{文件路径}} 的 {{目标章节:讨论}} 章节执行精修：\n1. 逻辑连贯性：段落间是否有逻辑跳跃\n2. 表述精准性：模糊表述→精确表述（给出修改前后对比）\n3. 冗余消除：删除重复论证\n\n约束：\n- 保持作者原有学术立场，不引入新观点\n- 所有修改用 [EDIT] 标记，原文用 [ORIG] 保留\n- 引用格式遵循{{引用风格:APA}}',
    steps: ['定位目标章节', '分析逻辑连贯性', '精修表述', '标注修改diff'],
    variables: ['学科', '文件路径', '目标章节', '引用风格'],
    category: 'paper',
  },
  {
    id: 'tpl-paper-verify',
    name: '论文自检验证',
    provider: 'claude',
    description: '检验论文修改是否保持原文论点、无新主张、引用正确',
    prompt: '你是质量审核员。检查 {{文件路径}} 的修改是否：\n1. 保持了原文所有关键论点（无遗漏）\n2. 未引入原文没有的新主张\n3. 引用编号与参考文献一一对应\n4. 修改后的表述在学术上准确\n\n如有问题，输出具体行号和问题描述。无问题则输出 PASS。',
    steps: ['加载原文与修改稿', '对比关键论点', '检查引用一致性', '输出审核结果'],
    variables: ['文件路径'],
    category: 'paper',
  },
  {
    id: 'tpl-ppt-create',
    name: 'PPT学术汇报',
    provider: 'claude',
    description: '将内容转化为学术汇报PPT，生成python-pptx脚本',
    prompt: '你是一位擅长{{领域}}学术汇报的演示设计专家。\n\n将 {{文件路径}} 的内容转化为{{页数:10}}页PPT，输出python-pptx可执行脚本。\n\n叙事结构：\n- 第1页：钩子 — 反直觉数据开场\n- 第2页：问题定义 — 1句话说清研究问题\n- 第3-N页：核心内容 — 每页只传达1个要点\n- 倒数第2页：关键洞察\n- 最后一页：行动呼吁\n\n每页约束：标题≤10字，正文≤5要点每点≤20字，配色{{配色:深色学术}}\n\n输出完整python-pptx脚本到 {{输出路径:ppt_output.py}}',
    steps: ['分析源内容', '规划叙事结构', '生成PPT脚本', '验证脚本可执行'],
    variables: ['领域', '文件路径', '页数', '配色', '输出路径'],
    category: 'ppt',
  },
  {
    id: 'tpl-code-review',
    name: '代码审查',
    provider: 'claude',
    description: '审查代码质量、最佳实践和潜在问题',
    prompt: '你是一位资深代码审查员。对 {{文件路径}} 执行代码审查：\n- 检查代码风格和可读性\n- 识别潜在bug和安全问题\n- 评估错误处理完整性\n- 建议性能优化点\n- 输出结构化审查报告',
    steps: ['读取代码文件', '风格检查', '安全审查', '性能分析', '生成报告'],
    variables: ['文件路径'],
    category: 'code',
  },
  {
    id: 'tpl-dep-check',
    name: '依赖安全检查',
    provider: 'codex',
    description: '检查项目依赖的安全漏洞和过时包',
    prompt: '检查 {{文件路径:package.json}} 中的依赖：\n1. 扫描所有直接和间接依赖\n2. 检查已知安全漏洞\n3. 识别过时版本\n4. 生成升级建议报告',
    steps: ['扫描依赖树', '检查安全漏洞', '识别过时版本', '生成建议'],
    variables: ['文件路径'],
    category: 'code',
  },
];

export function initBuiltinTemplates(): void {
  for (const tpl of BUILTIN_TEMPLATES) {
    if (!stmts.getTemplate(tpl.id)) {
      stmts.insertTemplate({
        id: tpl.id,
        name: tpl.name,
        provider: tpl.provider,
        description: tpl.description,
        prompt: tpl.prompt,
        steps: JSON.stringify(tpl.steps),
        variables: JSON.stringify(tpl.variables),
        category: tpl.category,
      });
    }
  }
}

export function createTemplate(input: { name: string; provider: string; description?: string; prompt?: string; steps?: string[]; variables?: string[]; category?: string }): string {
  const id = randomUUID();
  stmts.insertTemplate({
    id,
    name: input.name,
    provider: input.provider,
    description: input.description || '',
    prompt: input.prompt || '',
    steps: JSON.stringify(input.steps || []),
    variables: JSON.stringify(input.variables || []),
    category: input.category || 'general',
  });
  return id;
}

function parseTemplate(row: Record<string, unknown>): Template {
  return {
    ...(row as unknown as Template),
    steps: JSON.parse(String(row.steps)),
    variables: JSON.parse(String(row.variables)),
  };
}

export function listTemplates(): Template[] {
  return stmts.listTemplates().map(parseTemplate);
}

export function listTemplatesByCategory(category: string): Template[] {
  return stmts.listTemplatesByCategory(category).map(parseTemplate);
}

export function getTemplate(id: string): Template | null {
  const row = stmts.getTemplate(id);
  if (!row) return null;
  return parseTemplate(row);
}

export function deleteTemplate(id: string): void {
  stmts.deleteTemplate(id);
}

export function applyTemplate(templateId: string, variableValues: Record<string, string>): Template {
  const tpl = getTemplate(templateId);
  if (!tpl) throw new Error('Template not found');
  let prompt = tpl.prompt;
  for (const [key, value] of Object.entries(variableValues)) {
    const regex = new RegExp(`\\{\\{${key}[^}]*\\}\\}`, 'g');
    prompt = prompt.replace(regex, value);
  }
  prompt = prompt.replace(/\{\{[^}]+\}\}/g, '');
  return { ...tpl, prompt };
}
