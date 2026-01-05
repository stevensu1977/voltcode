# 切换项目功能

## 概述

用户可以在使用过程中随时切换项目目录，无需重启应用。切换项目会清空当前会话，重新选择新的工作目录。

## 功能实现

### 1. Sidebar 项目按钮

在 Sidebar 顶部添加了项目文件夹按钮：

```
┌────────┐
│   📁   │ ← 项目按钮（带绿色指示点）
│ ●      │
├────────┤
│   ☀️   │ ← Claude Code
├────────┤
│   ✨   │ ← Gemini CLI
└────────┘
```

**视觉设计：**
- 📁 文件夹图标，颜色为 `text-ide-accent`
- 右下角绿色圆点表示项目已激活
- 悬停时显示当前项目名称和"Change Project"提示
- 悬停效果：图标颜色变为 `text-ide-textLight`

**代码实现** ([components/Sidebar.tsx](components/Sidebar.tsx:63-76)):
```typescript
{onChangeProject && projectDir && (
  <div className="flex flex-col gap-1 w-full items-center pb-4 border-b border-ide-border/50">
    <div
      onClick={onChangeProject}
      className="relative p-2.5 rounded-xl cursor-pointer hover:bg-white/5 text-ide-accent hover:text-ide-textLight transition-all duration-200 group"
      title={`Change Project\nCurrent: ${projectName}`}
    >
      <Folder size={24} />
      {/* Small indicator dot */}
      <div className="absolute bottom-1 right-1 w-2 h-2 bg-green-500 rounded-full" />
    </div>
  </div>
)}
```

### 2. App.tsx 切换逻辑

**handleChangeProject 函数** ([App.tsx](App.tsx:74-83)):
```typescript
const handleChangeProject = () => {
  // Reset project directory to trigger project selector
  setProjectDir(null);
  // Clear messages
  setMessages(INITIAL_MESSAGES);
  // Reset generated code
  setGeneratedCode(null);
  // Reset active tab
  setActiveTab(Tab.PREVIEW);
};
```

**操作流程：**
1. 将 `projectDir` 设置为 `null`
2. 清空所有聊天消息，恢复初始欢迎消息
3. 清空生成的代码
4. 重置标签页为 Preview
5. 触发 ProjectSelector 组件显示

### 3. 状态传递

**Sidebar Props** ([components/Sidebar.tsx](components/Sidebar.tsx:30-35)):
```typescript
interface SidebarProps {
  activeTool: ToolId;
  onToolSelect: (toolId: ToolId) => void;
  onChangeProject?: () => void;   // 切换项目回调
  projectDir?: string | null;      // 当前项目路径
}
```

**App.tsx 传递** ([App.tsx](App.tsx:160-165)):
```typescript
<Sidebar
  activeTool={activeTool}
  onToolSelect={handleToolSelect}
  onChangeProject={handleChangeProject}
  projectDir={projectDir}
/>
```

## 使用场景

### 场景 1：切换到另一个项目

**步骤：**
1. 用户正在项目 A 中工作
2. 点击 Sidebar 顶部的 📁 按钮
3. 界面切换到 ProjectSelector
4. 选择项目 B 目录
5. 进入主界面，开始在项目 B 中工作

**状态变化：**
```
项目 A (活跃)
    ↓ 点击切换
ProjectSelector (选择中)
    ↓ 选择项目 B
项目 B (活跃)
```

### 场景 2：创建新项目

**步骤：**
1. 在当前项目中工作
2. 需要开始新项目
3. 点击 📁 按钮
4. 选择或创建新目录
5. 清空的聊天界面，全新开始

### 场景 3：切换回之前的项目

**注意：**
- 当前版本不保存项目历史
- 每次切换都需要重新选择目录
- 聊天历史不会保留

**未来改进：**
- 记住最近打开的项目列表
- 快速切换到最近项目
- 保存每个项目的聊天历史

## 技术细节

### 状态重置

切换项目时重置的状态：
```typescript
projectDir: null           // 触发 ProjectSelector
messages: INITIAL_MESSAGES // 恢复初始欢迎消息
generatedCode: null        // 清空生成的代码
activeTab: Tab.PREVIEW     // 重置到 Preview 标签
```

**保留的状态：**
```typescript
activeTool: 'claude'       // 保持选择的 CLI 工具
isConfigOpen: false        // 配置面板状态
```

### CLI Router 更新

切换项目后，当用户选择新目录时：

1. **useEffect 触发** ([App.tsx](App.tsx:35-46)):
```typescript
useEffect(() => {
  if (projectDir) {
    cliRouter.setProjectDir(projectDir);
    // 显示新项目路径消息
  }
}, [projectDir]);
```

2. **CLI Router 更新** ([services/cliRouter.ts](services/cliRouter.ts:25-28)):
```typescript
setProjectDir(dir: string) {
  this.projectDir = dir;
  console.log('[CLIRouter] Project directory set to:', dir);
}
```

3. **Claude CLI 使用新路径**:
```typescript
const command = Command.create('node', [
  claudePath,
  '--print',
  '--output-format', 'json',
  '--model', 'sonnet',
  '--dangerously-skip-permissions',
  '--add-dir', this.projectDir!,  // 新的项目目录
  fullPrompt
]);
```

### 项目名称显示

从完整路径提取项目名称：

```typescript
const projectName = projectDir ? projectDir.split('/').pop() || 'Project' : '';
```

**示例：**
```
路径: /Users/wsuam/Documents/my-project
名称: my-project

路径: /home/user/workspace/app
名称: app
```

## UI/UX 考虑

### 视觉反馈

1. **绿色指示点**：
   - 表示项目已激活
   - 位置：文件夹图标右下角
   - 大小：2x2 像素
   - 颜色：`bg-green-500`

2. **悬停效果**：
   - 背景：`hover:bg-white/5`
   - 图标颜色：`hover:text-ide-textLight`
   - 平滑过渡：`transition-all duration-200`

3. **Tooltip**：
   - 第一行："Change Project"
   - 第二行："Current: [项目名]"
   - 原生 HTML title 属性

### 用户确认

**当前行为：**
- 点击按钮立即切换，无确认对话框
- 所有未保存的聊天历史会丢失

**改进建议：**
```typescript
const handleChangeProject = async () => {
  // 如果有未保存的内容，显示确认对话框
  if (messages.length > 1) {
    const confirmed = await confirm(
      'Switch project?',
      'Your current chat history will be cleared. Continue?'
    );
    if (!confirmed) return;
  }

  // 执行切换
  setProjectDir(null);
  // ...
};
```

## 测试场景

### 功能测试

1. **基本切换**：
   ```
   1. 打开项目 A
   2. 生成一些代码
   3. 点击切换按钮
   4. 选择项目 B
   5. 验证：聊天历史已清空
   6. 验证：新消息显示项目 B 路径
   ```

2. **连续切换**：
   ```
   1. 项目 A → 项目 B
   2. 项目 B → 项目 C
   3. 项目 C → 项目 A（重新选择）
   ```

3. **取消切换**：
   ```
   1. 点击切换按钮
   2. 取消目录选择对话框
   3. 验证：停留在 ProjectSelector
   4. 必须选择目录才能继续
   ```

### 集成测试

1. **CLI 工具切换**：
   ```
   1. 在项目 A 中使用 Claude
   2. 切换到项目 B
   3. 切换到 Gemini CLI
   4. 验证：Gemini 使用项目 B 路径
   ```

2. **文件操作**：
   ```
   1. 项目 A：创建 index.html
   2. 切换到项目 B
   3. 项目 B：创建 index.html
   4. 验证：两个文件在不同目录
   ```

## 已知限制

1. **无历史记录**：
   - 不保存项目列表
   - 不记住最近打开的项目
   - 每次都需要浏览文件系统

2. **状态丢失**：
   - 聊天历史完全清空
   - 生成的代码预览消失
   - 无法恢复之前的对话

3. **无确认提示**：
   - 立即切换，无警告
   - 可能意外丢失工作

4. **单向操作**：
   - 无"返回上一个项目"功能
   - 必须重新选择目录

## 未来改进

### 短期改进

- [ ] 添加确认对话框
- [ ] 显示完整项目路径（悬停时）
- [ ] 项目名称截断处理（长路径）

### 中期改进

- [ ] 最近项目列表（5个）
- [ ] 项目快速切换下拉菜单
- [ ] 每个项目保存聊天历史
- [ ] 项目图标/颜色自定义

### 长期改进

- [ ] 项目工作区管理
- [ ] 多项目同时打开（标签页）
- [ ] 项目元数据（名称、描述、标签）
- [ ] 跨项目搜索
- [ ] 项目模板系统

## 总结

切换项目功能已完整实现：

✅ **一键切换**：Sidebar 顶部便捷按钮
✅ **状态重置**：清空聊天历史和生成内容
✅ **CLI 集成**：自动更新工作目录
✅ **视觉反馈**：绿色指示点和悬停提示
✅ **项目隔离**：文件操作在各自目录中

用户现在可以轻松地在多个项目之间切换，每个项目都有独立的工作空间，所有 AI 生成的文件都会保存在正确的目录中。
