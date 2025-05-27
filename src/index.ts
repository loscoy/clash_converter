import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { AuthService } from './services/auth';
import { ConverterService } from './services/converter';
import { SubscriptionUserInfo } from './types';

const app = express();
const port = process.env.PORT || 6060;

app.use(cors());

// 健康检查路由，用于Render监控
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Clash Converter API is running' });
});

app.get('/clash', async (req, res) => {
  try {
    // 从所有服务器获取节点数据
    const allInbounds = await AuthService.getInboundList();
    
    if (!allInbounds || allInbounds.length === 0) {
      return res.status(404).json({ error: '未找到有效的节点数据' });
    }

    // 获取第一个节点的 clientInfo
    const clientInfo = allInbounds[0].clientInfo[0];
    
    // 生成 Subscription-UserInfo header
    const userInfo: SubscriptionUserInfo = {
      upload: clientInfo.up,
      download: clientInfo.down,
      total: clientInfo.total,
      expire: Math.floor(clientInfo.expiryTime / 1000)
    };
    
    // 设置响应头
    res.setHeader('Subscription-Userinfo', ConverterService.generateSubscriptionUserInfo(userInfo));
    res.setHeader('Content-Type', 'text/yaml');
    
    // 从查询参数获取email
    const email = req.query.email as string | undefined;
    
    // 生成所有节点的链接(支持VLESS和VMESS)
    const v2rayLinks = allInbounds.map(inbound => {
      switch (inbound.protocol) {
        case 'vless':
          return ConverterService.generateVlessLink(inbound, email);
        case 'vmess':
          return ConverterService.generateVmessLink(inbound, email);
        default:
          console.warn(`不支持的协议: ${inbound.protocol}`);
          return null;
      }
    }).filter(e => e != null);
    
    // 生成 Clash 配置
    const clashConfig = ConverterService.convertV2RayToClashProxiesYAML(v2rayLinks);
    
    // 发送响应
    res.send(clashConfig);
  } catch (error) {
    console.error('获取节点数据时出错:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

app.listen(port, () => {
  console.log(`服务器运行在 ${port}`);
});
