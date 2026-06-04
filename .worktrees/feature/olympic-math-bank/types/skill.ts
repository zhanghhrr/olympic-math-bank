// 简化的 Skill 类型定义，用于兼容现有代码
export class Skill {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  async execute(params: any): Promise<any> {
    // 这是一个占位实现
    // 实际功能应该调用相应的 skill 执行逻辑
    console.warn(`Skill "${this.name}" execution not implemented`);
    return {
      content: '',
      text: '',
      confidence: 0,
    };
  }
}
