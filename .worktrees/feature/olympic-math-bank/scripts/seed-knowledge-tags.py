#!/usr/bin/env python3
"""
五级知识标签导入脚本
从 拓展思维知识树_五级.xlsx 导入所有1474个标签到数据库
"""

import pandas as pd
import sqlite3
import os
from pathlib import Path

# 数据库路径
DB_PATH = Path(__file__).parent.parent / "lib" / "db" / "dev.db"
EXCEL_PATH = Path("C:/Users/Twilight/Desktop/拓展思维知识树_五级.xlsx")


def generate_code(module, topic, subtopic, knowledge, skill, level):
    """生成唯一编码"""
    parts = [module]
    if topic and pd.notna(topic):
        parts.append(topic)
    if subtopic and pd.notna(subtopic):
        parts.append(subtopic)
    if knowledge and pd.notna(knowledge):
        parts.append(knowledge)
    if skill and pd.notna(skill):
        parts.append(skill)
    return "-".join(parts)


def import_knowledge_tags():
    """导入五级知识标签"""
    print("开始导入五级知识标签...")

    # 读取Excel
    df = pd.read_excel(EXCEL_PATH)
    print(f"读取到 {len(df)} 行数据")

    # 连接数据库
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 清空现有标签（如果表存在）
    try:
        cursor.execute("DELETE FROM question_knowledge_tags")
    except:
        pass
    try:
        cursor.execute("DELETE FROM knowledge_tags")
    except:
        pass
    conn.commit()
    print("已清空现有知识标签")

    # 用于存储已创建的节点，避免重复
    created_nodes = {}
    inserted_count = 0

    for idx, row in df.iterrows():
        module = row['一级模块'] if pd.notna(row['一级模块']) else None
        topic = row['二级模块'] if pd.notna(row['二级模块']) else None
        subtopic = row['三级模块'] if pd.notna(row['三级模块']) else None
        knowledge = row['四级模块'] if pd.notna(row['四级模块']) else None
        skill = row['五级知识点'] if pd.notna(row['五级知识点']) else None

        if not module:
            continue

        # 确定当前行的级别和名称
        if skill and pd.notna(skill):
            level = 5
            name = skill
        elif knowledge and pd.notna(knowledge):
            level = 4
            name = knowledge
        elif subtopic and pd.notna(subtopic):
            level = 3
            name = subtopic
        elif topic and pd.notna(topic):
            level = 2
            name = topic
        else:
            level = 1
            name = module

        # 生成唯一编码
        code = generate_code(module, topic, subtopic, knowledge, skill, level)

        # 检查是否已存在
        if code in created_nodes:
            continue

        # 查找父节点
        parent_id = None
        if level > 1:
            parent_code = generate_code(
                module,
                topic if level > 2 else None,
                subtopic if level > 3 else None,
                knowledge if level > 4 else None,
                None,
                level - 1
            )
            parent_id = created_nodes.get(parent_code)

        # 插入数据库
        cursor.execute("""
            INSERT INTO knowledge_tags (id, level, name, code, module, topic, subtopic, knowledge, skill, parentId, "order")
            VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            level, name, code, module, topic, subtopic, knowledge, skill, parent_id, idx
        ))

        # 记录创建的节点
        cursor.execute("SELECT id FROM knowledge_tags WHERE code = ?", (code,))
        node_id = cursor.fetchone()[0]
        created_nodes[code] = node_id
        inserted_count += 1

        if inserted_count % 100 == 0:
            print(f"已导入 {inserted_count} 个标签...")

    conn.commit()
    conn.close()

    print(f"\n导入完成！共导入 {inserted_count} 个五级知识标签")

    # 统计各级别数量
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    for level in range(1, 6):
        cursor.execute("SELECT COUNT(*) FROM knowledge_tags WHERE level = ?", (level,))
        count = cursor.fetchone()[0]
        print(f"  级别 {level}: {count} 个标签")
    conn.close()


if __name__ == "__main__":
    import_knowledge_tags()
