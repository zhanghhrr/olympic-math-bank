/**
 * 知识标签展示组件
 * 以符合认知规律的方式展示五级知识标签（从概括到具体）
 */

import React from 'react';

interface KnowledgeTag {
  id: string;
  name: string;
  level: number;
  module?: string;
  topic?: string;
  subtopic?: string;
  knowledge?: string;
  skill?: string;
  parent?: KnowledgeTag | null;
}

interface TagHierarchy {
  level1?: string; // 模块
  level2?: string; // 专题
  level3?: string; // 子专题
  level4?: string; // 知识点
  level5: string;  // 技能
}

interface KnowledgeTagDisplayProps {
  tags: Array<{
    id: string;
    name: string;
    level: number;
    parent?: any;
  }>;
  showPath?: boolean;
  compact?: boolean;
}

/**
 * 获取标签的层级结构
 */
function getTagHierarchy(tag: any): TagHierarchy {
  return {
    level1: tag.parent?.parent?.parent?.parent?.name,
    level2: tag.parent?.parent?.parent?.name,
    level3: tag.parent?.parent?.name,
    level4: tag.parent?.name,
    level5: tag.name,
  };
}

/**
 * 获取标签的完整路径
 */
function getTagPath(tag: any): string {
  const parts: string[] = [];
  if (tag.parent?.parent?.parent?.parent) parts.push(tag.parent.parent.parent.parent.name);
  if (tag.parent?.parent?.parent) parts.push(tag.parent.parent.parent.name);
  if (tag.parent?.parent) parts.push(tag.parent.parent.name);
  if (tag.parent) parts.push(tag.parent.name);
  parts.push(tag.name);
  return parts.join(' > ');
}

/**
 * 获取模块颜色
 */
function getModuleColor(moduleName?: string): string {
  const colors: Record<string, string> = {
    '计算模块': 'bg-blue-100 text-blue-800 border-blue-200',
    '几何模块': 'bg-green-100 text-green-800 border-green-200',
    '应用题模块': 'bg-orange-100 text-orange-800 border-orange-200',
    '计数模块': 'bg-purple-100 text-purple-800 border-purple-200',
    '数论模块': 'bg-red-100 text-red-800 border-red-200',
    '杂题模块': 'bg-gray-100 text-gray-800 border-gray-200',
  };
  return colors[moduleName || ''] || 'bg-slate-100 text-slate-800 border-slate-200';
}

/**
 * 获取模块图标
 */
function getModuleIcon(moduleName?: string): string {
  const icons: Record<string, string> = {
    '计算模块': '🔢',
    '几何模块': '📐',
    '应用题模块': '📝',
    '计数模块': '🎯',
    '数论模块': '🔢',
    '杂题模块': '🧩',
  };
  return icons[moduleName || ''] || '🏷️';
}

export function KnowledgeTagDisplay({ tags, showPath = true, compact = false }: KnowledgeTagDisplayProps) {
  if (!tags || tags.length === 0) {
    return <span className="text-gray-400 text-sm">未分类</span>;
  }

  return (
    <div className="space-y-2">
      {tags.map((tag, index) => {
        const hierarchy = getTagHierarchy(tag);
        const moduleName = hierarchy.level1;
        const colorClass = getModuleColor(moduleName);
        const icon = getModuleIcon(moduleName);

        if (compact) {
          // 紧凑模式：只显示技能标签和模块颜色
          return (
            <span
              key={tag.id}
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colorClass}`}
              title={getTagPath(tag)}
            >
              {icon} {tag.name}
            </span>
          );
        }

        return (
          <div key={tag.id} className="bg-white rounded-lg border border-gray-200 p-3">
            {/* 完整路径展示 */}
            {showPath && (
              <div className="flex flex-wrap items-center gap-1 text-sm mb-2">
                {hierarchy.level1 && (
                  <>
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                      {icon} {hierarchy.level1}
                    </span>
                    <span className="text-gray-400">›</span>
                  </>
                )}
                {hierarchy.level2 && (
                  <>
                    <span className="px-2 py-0.5 rounded bg-gray-50 text-gray-600">
                      {hierarchy.level2}
                    </span>
                    <span className="text-gray-400">›</span>
                  </>
                )}
                {hierarchy.level3 && (
                  <>
                    <span className="px-2 py-0.5 rounded bg-gray-50 text-gray-600">
                      {hierarchy.level3}
                    </span>
                    <span className="text-gray-400">›</span>
                  </>
                )}
                {hierarchy.level4 && (
                  <>
                    <span className="px-2 py-0.5 rounded bg-gray-50 text-gray-600">
                      {hierarchy.level4}
                    </span>
                    <span className="text-gray-400">›</span>
                  </>
                )}
                <span className={`px-2 py-0.5 rounded font-medium ${colorClass}`}>
                  {hierarchy.level5}
                </span>
              </div>
            )}

            {/* 认知路径展示（从概括到具体） */}
            <div className="mt-2 pt-2 border-t border-gray-100">
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-500 mt-1">认知路径:</span>
                <div className="flex-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    {/* 模块 - 最概括 */}
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${colorClass}`}>
                        {icon}
                      </div>
                      <span className="text-xs text-gray-500 mt-1">{hierarchy.level1 || '模块'}</span>
                    </div>

                    {/* 连接线 */}
                    <div className="w-8 h-0.5 bg-gray-200 mt-[-16px]"></div>

                    {/* 专题 */}
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-600">
                        2
                      </div>
                      <span className="text-xs text-gray-500 mt-1 max-w-[60px] truncate" title={hierarchy.level2}>
                        {hierarchy.level2 || '专题'}
                      </span>
                    </div>

                    {/* 连接线 */}
                    <div className="w-8 h-0.5 bg-gray-200 mt-[-16px]"></div>

                    {/* 子专题 */}
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-600">
                        3
                      </div>
                      <span className="text-xs text-gray-500 mt-1 max-w-[60px] truncate" title={hierarchy.level3}>
                        {hierarchy.level3 || '子专题'}
                      </span>
                    </div>

                    {/* 连接线 */}
                    <div className="w-8 h-0.5 bg-gray-200 mt-[-16px]"></div>

                    {/* 知识点 */}
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-600">
                        4
                      </div>
                      <span className="text-xs text-gray-500 mt-1 max-w-[60px] truncate" title={hierarchy.level4}>
                        {hierarchy.level4 || '知识点'}
                      </span>
                    </div>

                    {/* 连接线 */}
                    <div className="w-8 h-0.5 bg-gray-200 mt-[-16px]"></div>

                    {/* 技能 - 最具体 */}
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${colorClass}`}>
                        5
                      </div>
                      <span className="text-xs font-medium mt-1 max-w-[80px] truncate" title={hierarchy.level5}>
                        {hierarchy.level5}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 简洁标签展示（用于列表页）
 */
export function KnowledgeTagBadge({ tag }: { tag: any }) {
  const hierarchy = getTagHierarchy(tag);
  const colorClass = getModuleColor(hierarchy.level1);
  const icon = getModuleIcon(hierarchy.level1);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}
      title={getTagPath(tag)}
    >
      {icon}
      <span className="max-w-[100px] truncate">{tag.name}</span>
    </span>
  );
}

/**
 * 标签路径展示（用于详情页）
 */
export function KnowledgeTagPath({ tag }: { tag: any }) {
  const hierarchy = getTagHierarchy(tag);

  return (
    <div className="flex items-center gap-1 text-sm text-gray-600">
      {hierarchy.level1 && (
        <>
          <span className="text-gray-400">{getModuleIcon(hierarchy.level1)}</span>
          <span>{hierarchy.level1}</span>
          <span className="text-gray-300">›</span>
        </>
      )}
      {hierarchy.level2 && (
        <>
          <span className="hidden sm:inline">{hierarchy.level2}</span>
          <span className="hidden sm:inline text-gray-300">›</span>
        </>
      )}
      {hierarchy.level3 && (
        <>
          <span className="hidden md:inline">{hierarchy.level3}</span>
          <span className="hidden md:inline text-gray-300">›</span>
        </>
      )}
      {hierarchy.level4 && (
        <>
          <span className="hidden lg:inline">{hierarchy.level4}</span>
          <span className="hidden lg:inline text-gray-300">›</span>
        </>
      )}
      <span className="font-medium text-gray-900">{hierarchy.level5}</span>
    </div>
  );
}
