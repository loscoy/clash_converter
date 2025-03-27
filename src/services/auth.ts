import axios from 'axios';
import path from 'path';

interface ServerConfig {
  user: string;
  password: string;
  apiUrl: string;
}

function getServerConfigs(): ServerConfig[] {
  const configs: ServerConfig[] = [];
  let index = 1;
  
  while (true) {
    const user = process.env[`XUI_USER_${index}`];
    const password = process.env[`PASSWORD_${index}`];
    const apiUrl = process.env[`XUI_API_URL_${index}`];
    
    if (!user || !password || !apiUrl) {
      break;
    }
    
    configs.push({ user, password, apiUrl });
    index++;
  }
  
  if (configs.length === 0) {
    throw new Error('请在 .env 文件中设置至少一个服务器的配置');
  }
  
  return configs;
}

export class AuthService {
  private static readonly cookiePath = path.join(__dirname, '../../cookies.txt');
  private static readonly serverConfigs = getServerConfigs();
  private static readonly cookies: Map<string, string> = new Map();

  private static getBaseUrl(apiUrl: string): string {
    return `${apiUrl}/x-ui`;
  }

  private static getLoginUrl(apiUrl: string): string {
    return `${this.getBaseUrl(apiUrl)}/login`;
  }

  private static getListUrl(apiUrl: string): string {
    return `${this.getBaseUrl(apiUrl)}/xui/inbound/list`;
  }

  private static getInboundsUrl(apiUrl: string): string {
    return `${this.getBaseUrl(apiUrl)}/xui/inbounds`;
  }

  private static async login(serverConfig: ServerConfig): Promise<void> {
    const formData = new URLSearchParams();
    formData.append('username', serverConfig.user);
    formData.append('password', serverConfig.password);

    try {
      const response = await axios.post(
        this.getLoginUrl(serverConfig.apiUrl),
        formData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          withCredentials: true,
          maxRedirects: 5,
        },
      );

      const cookies = response.headers['set-cookie'];
      if (cookies && cookies.length > 0) {
        this.cookies.set(serverConfig.apiUrl, cookies.join('\n'));
      } else {
        throw new Error(`登录服务器 ${serverConfig.apiUrl} 失败：未收到 cookies`);
      }
    } catch (error) {
      console.error(`登录服务器 ${serverConfig.apiUrl} 失败:`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private static getCookie(apiUrl: string): string | null {
    return this.cookies.get(apiUrl) || null;
  }

  public static async getInboundList(): Promise<any[]> {
    const allInbounds: any[] = [];
    
    for (const serverConfig of this.serverConfigs) {
      try {
        let cookie = this.getCookie(serverConfig.apiUrl);
        
        if (!cookie) {
          await this.login(serverConfig);
          cookie = this.getCookie(serverConfig.apiUrl);
        }

        if (!cookie) {
          throw new Error(`无法获取服务器 ${serverConfig.apiUrl} 的有效 cookies`);
        }

        const response = await axios.post(this.getListUrl(serverConfig.apiUrl), {}, {
          headers: {
            Cookie: cookie,
            'Referer': this.getInboundsUrl(serverConfig.apiUrl),
            'Origin': new URL(this.getBaseUrl(serverConfig.apiUrl)).origin,
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          validateStatus: (status) => status === 200,
        });

        const url = new URL(serverConfig.apiUrl);
        const domain = url.hostname;
        const obj = response.data.obj;

        if (response.data && response.data.success === false && response.data.msg === '登录时效已过，请重新登录') {
          console.log(`服务器 ${serverConfig.apiUrl} 登录已过期，尝试重新登录...`);
          await this.login(serverConfig);
          cookie = this.getCookie(serverConfig.apiUrl);
          
          if (!cookie) {
            throw new Error(`重新登录后仍然无法获取服务器 ${serverConfig.apiUrl} 的有效 cookies`);
          }

          const retryResponse = await axios.post(this.getListUrl(serverConfig.apiUrl), {}, {
            headers: {
              Cookie: cookie,
              'Referer': this.getInboundsUrl(serverConfig.apiUrl),
              'Origin': new URL(this.getBaseUrl(serverConfig.apiUrl)).origin,
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'zh-CN,zh;q=0.9',
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
            },
          });

          // 确保 retryResponse.data 是数组
          const inboundData = Array.isArray(obj) ? obj : [];
          
          // 为每个入站配置添加域名
          const inboundsWithDomain = inboundData.map(inbound => ({
            ...inbound,
            domain: domain
          }));

          allInbounds.push(...inboundsWithDomain);
        } else {
          // 确保 retryResponse.data 是数组
          const inboundData = Array.isArray(obj) ? obj : [];
          
          // 为每个入站配置添加域名
          const inboundsWithDomain = inboundData.map(inbound => ({
            ...inbound,
            domain: domain
          }));
          allInbounds.push(...inboundsWithDomain || []);
        }
      } catch (error) {
        console.error(`获取服务器 ${serverConfig.apiUrl} 节点列表失败:`, error);
        // 继续处理下一个服务器
        continue;
      }
    }

    return allInbounds;
  }
} 