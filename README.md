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

## 使用方法

1. 确保 X-UI 面板正在运行，并且可以通过 `http://localhost:54321` 访问
2. 启动本服务器
3. 访问 `http://localhost:3000/output.yaml` 获取 Clash 配置

## 环境变量

- `PORT`: 服务器端口号（默认：3000）

## 注意事项

- 确保 X-UI 面板的 API 地址正确配置
- 确保有足够的权限访问 X-UI API
- 建议在生产环境中使用 HTTPS 