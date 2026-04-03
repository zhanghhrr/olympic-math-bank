#!/usr/bin/env python3
"""
将Excel五级知识树转换为JSON格式
"""

import pandas as pd
import json
import sys
from pathlib import Path

def convert_excel_to_json(excel_path: str, output_path: str):
    """读取Excel并转换为JSON"""
    print(f"读取Excel文件: {excel_path}")

    # 读取Excel
    df = pd.read_excel(excel_path)

    # 清理数据：去除完全空白的行
    df = df.dropna(subset=['一级模块'])

    # 转换为记录列表
    records = []
    for _, row in df.iterrows():
        record = {
            '一级模块': str(row['一级模块']) if pd.notna(row['一级模块']) else None,
            '二级模块': str(row['二级模块']) if pd.notna(row['二级模块']) else None,
            '三级模块': str(row['三级模块']) if pd.notna(row['三级模块']) else None,
            '四级模块': str(row['四级模块']) if pd.notna(row['四级模块']) else None,
            '五级知识点': str(row['五级知识点']) if pd.notna(row['五级知识点']) else None,
            '序号': int(row['序号']) if pd.notna(row['序号']) else None,
        }
        records.append(record)

    # 保存为JSON
    output_dir = Path(output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"已转换 {len(records)} 条记录")
    print(f"输出文件: {output_path}")

    # 统计各级标签数量
    stats = {
        '一级模块': len(set(r['一级模块'] for r in records if r['一级模块'])),
        '二级模块': len(set(r['二级模块'] for r in records if r['二级模块'])),
        '三级模块': len(set(r['三级模块'] for r in records if r['三级模块'])),
        '四级模块': len(set(r['四级模块'] for r in records if r['四级模块'])),
        '五级知识点': len(set(r['五级知识点'] for r in records if r['五级知识点'])),
    }

    print("\n统计信息:")
    for level, count in stats.items():
        print(f"  {level}: {count} 个")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        # 默认路径
        excel_path = r'C:\Users\Twilight\Desktop\拓展思维知识树_五级.xlsx'
        output_path = r'C:\Users\Twilight\.codebuddy\.worktrees\feature\olympic-math-bank\data\knowledge-tree.json'
    else:
        excel_path = sys.argv[1]
        output_path = sys.argv[2] if len(sys.argv) > 2 else 'knowledge-tree.json'

    convert_excel_to_json(excel_path, output_path)
