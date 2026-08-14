'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileCode, X, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useConsoleStore } from '@/stores/console-store';
import { fvApi } from '@/lib/fv/api';
import { cn } from '@/lib/utils';
import type { FvFileNode } from '@/lib/fv/types';

function extClass(ext?: string): string {
  const map: Record<string, string> = {
    tsx: 'text-sky-600', ts: 'text-sky-600', js: 'text-amber-600', json: 'text-emerald-600',
    yaml: 'text-rose-600', md: 'text-indigo-500', css: 'text-purple-500', py: 'text-blue-600',
    html: 'text-orange-600', sh: 'text-teal-600',
  };
  return map[ext || ''] || 'text-muted';
}

function TreeItem({ node, depth, expanded, toggle, onSelect }: {
  node: FvFileNode;
  depth: number;
  expanded: Set<string>;
  toggle: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  const isFolder = node.type === 'folder';
  const isExpanded = expanded.has(node.path);
  const selected = useConsoleStore((s) => s.selectedFile);

  return (
    <div>
      <button
        onClick={() => (isFolder ? toggle(node.path) : onSelect(node.path))}
        className={cn(
          'w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded-md text-left hover:bg-primary/5',
          !isFolder && selected === node.path && 'bg-primary/10 text-primary'
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {isFolder ? (
          <>
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" />}
            {isExpanded ? <FolderOpen className="w-4 h-4 text-primary/70 shrink-0" /> : <Folder className="w-4 h-4 text-primary/50 shrink-0" />}
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            <FileCode className={cn('w-4 h-4 shrink-0', extClass(node.ext))} />
          </>
        )}
        <span className="truncate text-text-body">{node.name}</span>
        {!isFolder && node.opsCount ? (
          <span className="ml-auto text-[10px] text-muted shrink-0">{node.opsCount}次</span>
        ) : null}
      </button>
      {isFolder && isExpanded && node.children?.map((c) => (
        <TreeItem key={c.path} node={c} depth={depth + 1} expanded={expanded} toggle={toggle} onSelect={onSelect} />
      ))}
    </div>
  );
}

function flatten(nodes: FvFileNode[]): FvFileNode[] {
  const out: FvFileNode[] = [];
  for (const n of nodes) {
    if (n.type === 'file') out.push(n);
    if (n.children) out.push(...flatten(n.children));
  }
  return out;
}

/** 文件详情面板：内容预览 + 关联 Agent + 变更记录 */
function FileDetailPanel({ filePath, onClose }: { filePath: string; onClose: () => void }) {
  const [content, setContent] = useState<{ content: string | null; error?: string } | null>(null);
  const [diffs, setDiffs] = useState<Array<Record<string, unknown>>>([]);
  const agents = useConsoleStore((s) => s.agents);

  useEffect(() => {
    void fvApi.fileContent(filePath).then(setContent).catch(() => setContent({ content: null, error: '读取失败' }));
    void fvApi.diffsByFile(filePath).then(setDiffs).catch(() => setDiffs([]));
  }, [filePath]);

  const relatedAgents = useMemo(
    () => agents.filter((a) => a.target.split(',').map((t) => t.trim()).filter(Boolean).includes(filePath)),
    [agents, filePath]
  );

  const handleRollback = async (diff: Record<string, unknown>) => {
    try {
      const { ok } = await fvApi.rollback(String(diff.file_path));
      if (ok) {
        toast.success(`已回滚 ${diff.file_path}`);
        void useConsoleStore.getState().loadTree();
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="border-l border-divider glass-panel flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-divider">
        <span className="text-sm font-medium text-heading truncate" title={filePath}>
          {filePath.split('/').pop()}
        </span>
        <button onClick={onClose} className="p-1 hover:bg-primary/10 rounded text-muted">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div>
          <h4 className="text-xs font-medium text-muted mb-1">预览</h4>
          <pre className="text-xs text-text-body glass-input border border-card-border rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap">
            {content?.content ? content.content.split('\n').slice(0, 25).join('\n') : (content?.error || '加载中...')}
          </pre>
          <p className="text-[10px] text-muted mt-1">{filePath}</p>
        </div>
        {relatedAgents.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted mb-1">关联 Agent</h4>
            <div className="space-y-1">
              {relatedAgents.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-xs text-text-body">
                  <span className={cn('w-1.5 h-1.5 rounded-full', a.status === 'running' ? 'bg-emerald-500' : a.status === 'completed' ? 'bg-primary' : 'bg-muted')} />
                  {a.name}
                  <span className="text-muted ml-auto">{Math.round(a.progress)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {diffs.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted mb-1">变更记录</h4>
            <div className="space-y-2">
              {diffs.slice(0, 3).map((d) => (
                <div key={Number(d.id)} className="border border-card-border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-2 py-1 bg-primary/5 text-[10px] text-muted">
                    <span>#{Number(d.id)}</span>
                    <button
                      onClick={() => void handleRollback(d)}
                      className="inline-flex items-center gap-1 text-primary hover:text-accent"
                    >
                      <RotateCcw className="w-3 h-3" /> 回滚
                    </button>
                  </div>
                  <pre className="text-[10px] p-2 overflow-auto max-h-40">
                    {String(d.diff_content).split('\n').map((line, i) => (
                      <div key={i} className={cn(line.startsWith('+') ? 'text-emerald-600' : line.startsWith('-') ? 'text-rose-500' : 'text-muted')}>
                        {line}
                      </div>
                    ))}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function FileTab() {
  const tree = useConsoleStore((s) => s.tree);
  const treeRoot = useConsoleStore((s) => s.treeRoot);
  const selectedFile = useConsoleStore((s) => s.selectedFile);
  const setSelectedFile = useConsoleStore((s) => s.setSelectedFile);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const flatFiles = useMemo(() => (tree ? flatten(tree) : []), [tree]);
  const filtered = useMemo(() => {
    if (!search) return flatFiles;
    return flatFiles.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));
  }, [flatFiles, search]);

  return (
    <div className="h-full grid grid-cols-[280px_1fr] lg:grid-cols-[280px_1fr_360px]" data-testid="file-tab">
      {/* 文件树 */}
      <aside className="border-r border-divider glass-sidebar overflow-auto p-2">
        <div className="flex items-center justify-between px-2 py-1 mb-1">
          <span className="text-xs font-medium text-muted">文件树</span>
          <button
            onClick={() => setExpanded(new Set())}
            className="text-[10px] text-secondary hover:text-primary"
          >
            全部折叠
          </button>
        </div>
        <p className="px-2 pb-1 text-[10px] text-muted truncate" title={treeRoot}>{treeRoot}</p>
        {tree?.map((n) => (
          <TreeItem key={n.path} node={n} depth={0} expanded={expanded} toggle={toggle} onSelect={setSelectedFile} />
        ))}
        {!tree && <p className="text-xs text-muted p-2">加载中...</p>}
      </aside>

      {/* 文件网格 */}
      <div className="flex flex-col min-h-0">
        <div className="px-4 py-2 border-b border-divider flex items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索文件..."
            className="pl-3 pr-3 py-1.5 border border-card-border rounded-lg w-64 glass-input focus:outline-none focus:ring-2 focus:ring-accent text-sm text-text-body placeholder:text-muted"
            data-testid="file-search"
          />
          <span className="text-xs text-muted ml-auto">{filtered.length} 个文件</span>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-primary/5 border-b border-card-border sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted">名称</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted w-20">大小</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted w-28">修改时间</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted w-16">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {filtered.map((f) => (
                <tr
                  key={f.path}
                  onClick={() => setSelectedFile(f.path)}
                  className={cn('cursor-pointer hover:bg-primary/5', selectedFile === f.path && 'bg-primary/10')}
                >
                  <td className="px-4 py-1.5 flex items-center gap-2 text-text-body">
                    <FileCode className={cn('w-4 h-4 shrink-0', extClass(f.ext))} />
                    <span className="truncate">{f.name}</span>
                    {!!f.opsCount && <span className="text-[10px] text-muted shrink-0">({f.opsCount})</span>}
                  </td>
                  <td className="px-4 py-1.5 text-muted text-xs">{f.size}</td>
                  <td className="px-4 py-1.5 text-muted text-xs">{f.modified}</td>
                  <td className="px-4 py-1.5 text-muted text-xs">{f.ext}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted text-sm">无文件</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 详情面板 */}
      {selectedFile && (
        <FileDetailPanel filePath={selectedFile} onClose={() => setSelectedFile(null)} />
      )}
    </div>
  );
}
