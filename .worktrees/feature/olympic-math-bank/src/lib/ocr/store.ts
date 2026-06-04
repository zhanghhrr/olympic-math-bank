import { OCRProgress } from './types';

class OCRStore {
  private tasks = new Map<string, OCRProgress>();

  createTask(taskId: string): void {
    this.tasks.set(taskId, {
      status: 'pending',
      progress: 0,
      message: '等待处理...',
    });
  }

  updateTask(taskId: string, progress: Partial<OCRProgress>): void {
    const current = this.tasks.get(taskId);
    if (current) {
      this.tasks.set(taskId, { ...current, ...progress });
    }
  }

  getTask(taskId: string): OCRProgress | undefined {
    return this.tasks.get(taskId);
  }

  deleteTask(taskId: string): void {
    this.tasks.delete(taskId);
  }

  cleanupOldTasks(maxAgeMs: number = 3600000): void {
    // 清理1小时前的任务
    const now = Date.now();
    for (const [id, task] of this.tasks.entries()) {
      if (task.status === 'completed' || task.status === 'failed') {
        this.tasks.delete(id);
      }
    }
  }
}

export const ocrStore = new OCRStore();
