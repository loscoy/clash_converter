import { Buffer } from 'buffer';
import fs from 'fs';
import jsyaml from 'js-yaml';
import path from 'path';
import { Proxy, SubscriptionUserInfo } from '../types';

const atob = (str: string): string => Buffer.from(str, 'base64').toString('binary');

interface ClashConfig {
  proxies: Proxy[];
  'proxy-groups': any[];
  port: number;
  'socks-port': number;
  'allow-lan': boolean;
  mode: string;
  'log-level': string;
  'external-controller': string;
  'unified-delay': boolean;
  hosts: Record<string, string>;
  dns: {
    enable: boolean;
    'use-hosts': boolean;
    nameserver: string[];
    'default-nameserver': string[];
  };
}

export class ConverterService {
  private static readonly templatePath = path.join(__dirname, '../../templates/template.yaml');

  public static generateVlessLink(inbound: any, email?: string): string | null {
    const settings = JSON.parse(inbound.settings);
    const streamSettings = JSON.parse(inbound.streamSettings);
    
    // 根据email参数匹配client
    let client = null;
    if (email) {
      client = settings.clients.find((c: any) => c.email === email);
      if (!client) {
        return null;
      }
    } else {
      throw new Error('未找到用户');
    }
    
    // 使用 inbound.domain 或 inbound.listen，如果都没有则抛出错误
    const serverAddress = inbound.domain;
    if (!serverAddress) {
      throw new Error('服务器地址未定义，需要 domain 或 listen 字段');
    }
    
    // 根据协议构建基本链接
    let link = `${inbound.protocol}://${client.id}@${serverAddress}:${inbound.port}`;
    
    // 添加参数
    const params = new URLSearchParams();
    
    // 添加网络类型
    params.append('type', streamSettings.network || 'tcp');
    
    // 添加安全设置
    if (streamSettings.security === 'reality') {
      params.append('security', 'reality');
      params.append('sni', streamSettings.realitySettings.serverNames[0]);
      params.append('pbk', streamSettings.realitySettings.publicKey);
      params.append('fp', 'chrome');
    }
    
    // 添加流控
    if (client.flow) {
      params.append('flow', client.flow);
    }
    
    // 处理过期时间
    const expiryDate = new Date(client.expiryTime);
    const formattedExpiry = expiryDate.toISOString().split('T')[0].replace(/-/g, '');
    
    // 添加备注信息
    const remark = `${inbound.remark}|${client.email}|${Math.floor(client.total / (1024 * 1024 * 1024))}GB|${formattedExpiry}`;
    
    // 组合完整链接
    link += `?${params.toString()}#${encodeURIComponent(remark)}`;
    
    return link;
  }

  public static convertV2RayToClashProxiesYAML(v2rayLinks: string | string[]): string {
    // 如果输入是字符串，按换行符分割
    const links = typeof v2rayLinks === 'string' 
      ? v2rayLinks.split(/\r?\n/).map(link => link.trim()).filter(link => link)
      : v2rayLinks;

    if (!links || links.length === 0) {
      console.error("输入无效，需要包含 V2Ray 链接的字符串或链接数组。");
      return '';
    }

    const proxies: Proxy[] = [];

    links.forEach((link, index) => {
      try {
        let proxy = null;
        if (link.startsWith('vmess://')) {
          proxy = this.parseVmessLink(link, index);
        } else if (link.startsWith('vless://')) {
          proxy = this.parseVlessLink(link, index);
        } else {
          console.warn(`跳过不支持的链接格式: ${link.substring(0, 30)}...`);
        }

        if (proxy) {
          proxies.push(proxy);
        }
      } catch (error) {
        console.error(`处理链接时出错 "${link.substring(0, 30)}...":`, error instanceof Error ? error.message : String(error));
      }
    });

    if (proxies.length === 0) {
      console.log("没有成功转换任何有效的 V2Ray 节点。");
      return '';
    }

    try {
      // 读取模板文件
      const template = fs.readFileSync(this.templatePath, 'utf8');
      const config = jsyaml.load(template) as ClashConfig;
      
      // 替换 proxies
      config.proxies = proxies;
      // add proxies to proxy-groups - 选择节点 - proxies
      config['proxy-groups'].push({
          name: "🔰 选择节点",
          type: "select",
          proxies: proxies.map(proxy => proxy.name)
      });
      
      // 保存到 output.yaml
      const outputPath = path.join(__dirname, '../../output.yaml');
      fs.writeFileSync(outputPath, jsyaml.dump(config, { indent: 2 }));
      
      // 返回配置
      return jsyaml.dump(config, { indent: 2 });
    } catch (yamlError) {
      console.error("生成 YAML 时出错:", yamlError);
      return '';
    }
  }

  private static parseVmessLink(link: string, index: number): Proxy | null {
    const encodedData = link.substring('vmess://'.length);
    let decodedString: string;
    try {
      const base64String = encodedData.replace(/-/g, '+').replace(/_/g, '/');
      decodedString = atob(base64String);
    } catch (e) {
      console.error(`无法解码 Base64: ${encodedData.substring(0, 20)}...`, e);
      return null;
    }

    let vmessConfig: any;
    try {
      vmessConfig = JSON.parse(decodedString);
    } catch (e) {
      console.error(`无法解析 JSON: ${decodedString.substring(0, 50)}...`, e);
      return null;
    }

    if (!vmessConfig.add || !vmessConfig.port || !vmessConfig.id) {
      console.warn(`跳过不完整的 VMess 配置: ${JSON.stringify(vmessConfig)}`);
      return null;
    }

    const proxy: Proxy = {
      name: decodeURIComponent(vmessConfig.ps || `vmess_${index + 1}`),
      type: 'vmess',
      server: vmessConfig.add,
      port: parseInt(vmessConfig.port, 10),
      uuid: vmessConfig.id,
      alterId: parseInt(vmessConfig.aid || '0', 10),
      cipher: vmessConfig.scy || vmessConfig.security || 'auto',
      udp: true,
      tls: vmessConfig.tls === 'tls',
      'skip-cert-verify': vmessConfig.skipcert === 'true' || vmessConfig.allowInsecure === true,
      servername: vmessConfig.sni || (vmessConfig.tls === 'tls' ? vmessConfig.host || vmessConfig.add : undefined),
      network: vmessConfig.net || 'tcp',
    };

    if (proxy.network === 'ws') {
      proxy['ws-opts'] = {
        path: vmessConfig.path || '/',
        headers: {
          Host: vmessConfig.host || proxy.server
        }
      };
    }

    if (proxy.network === 'h2') {
      proxy['h2-opts'] = {
        host: [vmessConfig.host || proxy.server],
        path: vmessConfig.path || '/'
      };
    }

    if (proxy.network === 'grpc') {
      proxy['grpc-opts'] = {
        'grpc-service-name': vmessConfig.path || vmessConfig.serviceName || ''
      };
    }

    if (!proxy.tls) {
      delete proxy.servername;
      delete proxy['skip-cert-verify'];
    } else {
      if (!proxy.servername) proxy.servername = proxy.server;
    }

    if (proxy['ws-opts'] && !proxy['ws-opts'].path && (!proxy['ws-opts'].headers || !proxy['ws-opts'].headers.Host)) delete proxy['ws-opts'];
    if (proxy['h2-opts'] && (!proxy['h2-opts'].path || !proxy['h2-opts'].host || proxy['h2-opts'].host.length === 0)) delete proxy['h2-opts'];
    if (proxy['grpc-opts'] && !proxy['grpc-opts']['grpc-service-name']) delete proxy['grpc-opts'];

    return proxy;
  }

  private static parseVlessLink(link: string, index: number): Proxy | null {
    try {
      const url = new URL(link);

      if (!url.hostname || !url.port || !url.username) {
        console.warn(`跳过不完整的 VLESS 链接 (缺少 host, port, or uuid): ${link.substring(0, 50)}...`);
        return null;
      }

      const params = url.searchParams;

      const proxy: Proxy = {
        name: url.hash ? decodeURIComponent(url.hash.substring(1)) : `vless_${index + 1}`,
        type: 'vless',
        server: url.hostname,
        port: parseInt(url.port, 10),
        uuid: url.username,
        udp: true,
        tls: params.get('security') === 'tls' || params.get('security') === 'reality',
        'skip-cert-verify': params.get('allowInsecure') === '1' || params.get('allowInsecure') === 'true',
        servername: params.get('sni') || (params.get('security') === 'tls' || params.get('security') === 'reality' ? params.get('host') || url.hostname : undefined),
        network: params.get('type') || 'tcp',
        flow: params.get('flow') || undefined,
      };

      if (!proxy.flow) delete proxy.flow;

      if (proxy.network === 'ws') {
        proxy['ws-opts'] = {
          path: params.get('path') || '/',
          headers: {
            Host: params.get('host') || proxy.server
          }
        };
      }

      if (proxy.network === 'grpc') {
        proxy['grpc-opts'] = {
          'grpc-service-name': params.get('serviceName') || ''
        };
      }

      if (proxy.network === 'h2') {
        proxy['h2-opts'] = {
          host: [params.get('host') || proxy.server],
          path: params.get('path') || '/'
        };
      }

      if (params.get('security') === 'reality') {
        proxy.tls = true;
        proxy['client-fingerprint'] = params.get('fp') || 'chrome';
        const realityOpts: Proxy['reality-opts'] = {};
        if (params.get('pbk')) {
          realityOpts['public-key'] = params.get('pbk')!;
        }
        if (params.get('sid')) {
          realityOpts['short-id'] = params.get('sid')!;
        }
        if (params.get('spx')) {
          realityOpts['spider-x'] = params.get('spx')!;
        }

        if (Object.keys(realityOpts).length > 0) {
          proxy['reality-opts'] = realityOpts;
        }
      }

      return proxy;
    } catch (error) {
      console.error(`解析 VLESS 链接时出错: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  public static generateSubscriptionUserInfo(userInfo: SubscriptionUserInfo): string {
    return `upload=${userInfo.upload}; download=${userInfo.download}; total=${userInfo.total}; expire=${userInfo.expire}`;
  }
}
