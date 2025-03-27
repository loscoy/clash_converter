# Clash 配置转换器

这是一个用于将 X-UI 的节点配置转换为 Clash 配置的服务器。

## 功能特点

- 从 X-UI API 获取节点数据
- 自动转换为 Clash 配置格式
- 支持 VMess 和 VLESS 协议
- 自动添加流量统计信息到响应头

## 安装

```bash
# 安装依赖
yarn install

# 开发模式运行
yarn dev

# 构建
yarn build

# 生产模式运行
yarn start
```

## PM2 部署

本项目使用 PM2 进行进程管理和部署。以下是 PM2 相关的命令：

```bash
# 使用 PM2 启动应用
yarn deploy
```

### PM2 配置说明

PM2 配置文件 `ecosystem.config.js` 包含以下主要配置：

- `name`: 应用名称
- `script`: 启动脚本路径
- `instances`: 实例数量（设置为1）
- `autorestart`: 自动重启
- `watch`: 文件监视（生产环境关闭）
- `max_memory_restart`: 内存限制（100M）
- `env`: 环境变量配置

## 使用方法

1. 确保 X-UI 面板正在运行，并且可以通过 `http://host:port` 访问
2. 启动本服务器
3. 访问 `http://host:6060/clash` 获取 Clash 配置

## 环境变量

- `PORT`: 服务器端口号（默认：6060）

## 注意事项

- 确保 X-UI 面板的 API 地址正确配置
- 确保有足够的权限访问 X-UI API
- 建议在生产环境中使用 HTTPS
