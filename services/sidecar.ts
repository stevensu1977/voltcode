// services/sidecar.ts
import { Command, Child } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';

export type CLITool = 'claude' | 'gemini' | 'codex' | 'kiro';

interface SidecarProcess {
  tool: CLITool;
  process: Child | null;
  isRunning: boolean;
  binPath?: string;
}

class SidecarManager {
  private processes: Map<CLITool, SidecarProcess> = new Map();
  private outputHandlers: Map<CLITool, (data: string) => void> = new Map();
  private nodePath: string | null = null;
  private claudePath: string | null = null;

  /**
   * 初始化路径
   */
  private async initializePaths(): Promise<void> {
    if (!this.nodePath) {
      this.nodePath = await invoke<string>('get_node_path');
      console.log('Node path:', this.nodePath);
    }

    if (!this.claudePath) {
      // 解压 Claude Code
      const extractResult = await invoke<{success: boolean, path: string, message: string}>(
        'extract_cli',
        { cliName: 'claude-code' }
      );

      if (extractResult.success) {
        // Claude CLI 位于 node_modules/.bin/claude
        this.claudePath = `${extractResult.path}/node_modules/.bin/claude`;
        console.log('Claude path:', this.claudePath);
      } else {
        throw new Error(`Failed to extract Claude CLI: ${extractResult.message}`);
      }
    }
  }

  /**
   * 检查 CLI 是否正在运行
   */
  isRunning(tool: CLITool): boolean {
    return this.processes.get(tool)?.isRunning ?? false;
  }

  /**
   * 获取 Claude CLI 路径
   */
  async getClaudePath(): Promise<string> {
    if (!this.claudePath) {
      await this.initializePaths();
    }
    return this.claudePath!;
  }

  /**
   * 获取 Node 路径
   */
  async getNodePath(): Promise<string> {
    if (!this.nodePath) {
      await this.initializePaths();
    }
    return this.nodePath!;
  }

  /**
   * 停止所有 CLI 工具
   */
  async stopAll(): Promise<void> {
    const promises = Array.from(this.processes.keys()).map(tool => {
      const sidecar = this.processes.get(tool);
      if (sidecar?.process) {
        return sidecar.process.kill().catch(console.error);
      }
      return Promise.resolve();
    });
    await Promise.all(promises);
    this.processes.clear();
  }
}

// 导出单例
export const sidecarManager = new SidecarManager();
