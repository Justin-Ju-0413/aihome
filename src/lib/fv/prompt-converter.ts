/** 任务类型检测与 prompt 转换（原 prompt-converter.js 移植） */

export interface TaskPattern {
  label: string;
  icon: string;
  keywords: string[];
  claude: (task: string, opts: ConvertOpts) => string;
  codex: (task: string, opts: ConvertOpts) => string;
  hermes: (task: string, opts: ConvertOpts) => string;
}

export interface ConvertOpts {
  model?: string;
  target?: string;
  skill?: string;
  cwd?: string;
}

export interface ConvertResult {
  prompt: string;
  taskType: string;
  taskLabel: string;
  taskIcon: string;
  provider: string;
  originalTask: string;
}

const TASK_PATTERNS: Record<string, TaskPattern> = {
  code_generation: {
    label: '代码生成', icon: '✨',
    keywords: ['写', '实现', '创建', '生成', '编写', '开发', 'build', 'create', 'implement', 'generate', 'write code', '新增功能', 'add feature', '新建'],
    claude: (task, opts) => {
      let p = `<task>\n${task}\n</task>\n<instructions>\n请直接编写代码，使用 Edit 或 Write 工具修改文件。\n- 每步只修改一个文件，修改后验证语法\n- 遵循项目现有代码风格和约定\n- 添加必要的错误处理\n</instructions>`;
      if (opts.target) p += `\n<target_files>\n${opts.target}\n</target_files>`;
      if (opts.cwd) p += `\n<working_directory>${opts.cwd}</working_directory>`;
      return p;
    },
    codex: (task, opts) => {
      let p = task;
      if (opts.target) p += `\n\nTarget files: ${opts.target}`;
      p += '\n\nImplement the above. Write code directly. Follow existing code style. Add error handling.';
      return p;
    },
    hermes: (task, opts) => {
      let p = task;
      if (opts.skill) p = `[skill:${opts.skill}] ${p}`;
      p += '\n\nUse code_execution tool to implement. Follow existing conventions.';
      return p;
    },
  },
  code_review: {
    label: '代码审查', icon: '🔍',
    keywords: ['审查', 'review', '检查', '诊断', '分析代码', 'code review', 'lint', 'audit', '问题', '质量', 'quality'],
    claude: (task, opts) => {
      let p = `<task type="review">\n${task}\n</task>\n<review_format>\n对每个文件按以下格式输出：\n## 🔴 严重问题 (Critical)\n## 🟡 建议改进 (Warning)\n## 🟢 良好实践 (Good)\n## 📊 总结\n- 问题数/严重度/建议修复优先级\n</review_format>`;
      if (opts.target) p += `\n<files_to_review>\n${opts.target}\n</files_to_review>`;
      return p;
    },
    codex: (task) => `${task}\n\nReview the code thoroughly. List issues by severity: CRITICAL, WARNING, INFO. For each issue provide: location, description, suggested fix.`,
    hermes: (task) => `${task}\n\nPerform thorough code review. Read each file, categorize findings by severity (Critical/Warning/Info), suggest fixes with code examples.`,
  },
  refactoring: {
    label: '重构优化', icon: '♻️',
    keywords: ['重构', '优化', 'refactor', 'restructure', '改善', '简化', 'clean up', '重写', 'rewrite', 'improve'],
    claude: (task) => `<task type="refactor">\n${task}\n</task>\n<instructions>\n1. 先读取所有相关文件，理解现有逻辑\n2. 分析依赖关系和影响范围\n3. 逐文件重构，保持功能不变\n4. 每步验证语法正确和测试通过\n5. 最后输出变更摘要\n</instructions>`,
    codex: (task) => `${task}\n\nRefactor step by step. Read all related files first. Preserve all existing functionality and tests. Verify after each change. Output change summary.`,
    hermes: (task) => `${task}\n\nRefactor carefully. Read files first, analyze dependencies, plan changes, then execute step by step. Use code_execution tool. Verify each step.`,
  },
  debugging: {
    label: '调试修复', icon: '🐛',
    keywords: ['调试', '修复', 'debug', 'fix', '排错', '解决', '报错', '错误', 'bug', 'error', 'crash', '异常', 'exception', 'traceback'],
    claude: (task) => `<task type="debug">\n${task}\n</task>\n<debug_approach>\n1. 读取相关代码和错误信息\n2. 定位错误根源（二分法排查）\n3. 提出修复方案及影响分析\n4. 实施最小化修复\n5. 验证修复并检查边界情况\n</debug_approach>`,
    codex: (task) => `${task}\n\nDebug and fix. Read the error, trace to root cause, apply minimal fix, verify. Check edge cases.`,
    hermes: (task) => `${task}\n\nDebug systematically. Read error output, trace to source code, identify root cause, apply minimal fix, verify with test.`,
  },
  documentation: {
    label: '文档生成', icon: '📖',
    keywords: ['文档', '注释', '说明', 'document', 'comment', 'readme', 'doc', 'javadoc', 'jsdoc', 'annotate'],
    claude: (task) => `<task type="documentation">\n${task}\n</task>\n<format>\n使用 JSDoc/TSDoc 格式添加注释。包含：\n- @param 参数说明（类型+含义）\n- @returns 返回值说明\n- @example 使用示例\n- @throws 异常说明\n- 复杂逻辑添加行内注释\n</format>`,
    codex: (task) => `${task}\n\nAdd documentation and comments. Use standard JSDoc format with @param, @returns, @example, @throws.`,
    hermes: (task) => `${task}\n\nGenerate comprehensive documentation. Add JSDoc/TSDoc comments with parameter descriptions, return values, examples, and exception notes.`,
  },
  analysis: {
    label: '分析评估', icon: '📊',
    keywords: ['分析', '评估', '比较', 'analyze', 'evaluate', 'compare', '统计', '报告', '总结', 'summary', 'report', 'benchmark', '性能'],
    claude: (task) => `<task type="analysis">\n${task}\n</task>\n<output_format>\n提供结构化分析报告：\n## 概述 (Executive Summary)\n## 详细发现 (Findings)\n- 每项发现附数据支撑和代码引用\n## 对比分析 (Comparison)\n## 建议与结论 (Recommendations)\n- 按优先级排列，附预期收益\n</output_format>`,
    codex: (task) => `${task}\n\nAnalyze and provide structured report with: Executive Summary, Detailed Findings (with data and code references), Comparison, Recommendations (prioritized with expected impact).`,
    hermes: (task) => `${task}\n\nAnalyze thoroughly. Provide structured report: Summary, Findings with evidence, Comparison, Prioritized recommendations with expected impact.`,
  },
  testing: {
    label: '测试验证', icon: '🧪',
    keywords: ['测试', 'test', '验证', 'verify', '单元测试', 'unit test', '集成测试', 'integration', 'coverage', '覆盖率', 'spec'],
    claude: (task) => `<task type="testing">\n${task}\n</task>\n<instructions>\n1. 分析现有代码的测试覆盖\n2. 编写测试用例覆盖关键路径\n3. 包含正常/边界/异常场景\n4. 运行测试验证通过\n5. 输出覆盖率报告\n</instructions>`,
    codex: (task) => `${task}\n\nWrite tests. Cover happy path, edge cases, and error scenarios. Run tests and verify. Report coverage.`,
    hermes: (task) => `${task}\n\nWrite comprehensive tests. Cover normal, boundary, and error cases. Use code_execution to run and verify.`,
  },
  deployment: {
    label: '部署发布', icon: '🚀',
    keywords: ['部署', 'deploy', '发布', 'release', '上线', '打包', 'build', 'publish', 'CI/CD', 'docker', '容器'],
    claude: (task) => `<task type="deployment">\n${task}\n</task>\n<instructions>\n1. 检查部署前清单（测试/构建/配置）\n2. 执行部署步骤\n3. 验证部署结果\n4. 输出部署摘要和回滚方案\n</instructions>`,
    codex: (task) => `${task}\n\nDeploy step by step. Check pre-deployment checklist, execute, verify, provide rollback plan.`,
    hermes: (task) => `${task}\n\nDeploy carefully. Check prerequisites, execute deployment steps, verify, document rollback procedure.`,
  },
};

export function detectTaskType(task: string): string {
  const lower = task.toLowerCase();
  let bestMatch = 'code_generation';
  let bestScore = 0;
  for (const [type, config] of Object.entries(TASK_PATTERNS)) {
    const score = config.keywords.reduce((sum, kw) => sum + (lower.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = type;
    }
  }
  return bestMatch;
}

export function detectCompositeTasks(task: string): Array<{ task: string; type: string }> | null {
  const lower = task.toLowerCase();
  const separators = ['然后', '接着', '之后', '并且', '同时', '以及', 'and then', 'then', 'after that', 'and also', ';', '，然后', '，接着'];
  for (const sep of separators) {
    if (lower.includes(sep)) {
      const splitParts = task.split(sep).map((s) => s.trim()).filter(Boolean);
      if (splitParts.length > 1) {
        return splitParts.map((p) => ({ task: p, type: detectTaskType(p) }));
      }
    }
  }
  return null;
}

export function convert(task: string, provider: string, opts: ConvertOpts = {}): ConvertResult {
  const taskType = detectTaskType(task);
  const pattern = TASK_PATTERNS[taskType];
  if (!pattern) {
    return { prompt: task, taskType: 'general', taskLabel: '通用', taskIcon: '⚙️', provider, originalTask: task };
  }
  const converter = pattern[provider as keyof TaskPattern] as ((t: string, o: ConvertOpts) => string) | undefined;
  const convertedPrompt = converter ? converter(task, opts) : task;
  return {
    prompt: convertedPrompt,
    taskType,
    taskLabel: pattern.label,
    taskIcon: pattern.icon,
    provider,
    originalTask: task,
  };
}

export function getTaskTypes(): Array<{ id: string; label: string; icon: string; keywords: string[] }> {
  return Object.entries(TASK_PATTERNS).map(([id, config]) => ({
    id,
    label: config.label,
    icon: config.icon,
    keywords: config.keywords,
  }));
}
