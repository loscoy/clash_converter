// 如果在 Node.js 环境，需要引入 js-yaml 和 Buffer (用于 atob)
const jsyaml = require('js-yaml');
const { Buffer } = require('buffer');
const path = require('path');
const fs = require('fs');
const atob = (str) => Buffer.from(str, 'base64').toString('binary'); // Node.js 的 atob 实现
// 如果在浏览器环境，请确保已通过 <script> 标签引入 js-yaml 库 (https://github.com/nodeca/js-yaml)
// 浏览器自带 atob 函数

/**
 * 将 V2Ray 节点链接 (vmess://, vless://) 转换为 Clash 配置的 proxies 部分 (YAML)
 * @param {string} v2rayLinks - 包含一个或多个 V2Ray 链接的字符串，链接之间用换行符分隔
 * @returns {string} - Clash 配置的 YAML 字符串 (仅包含 proxies 部分)
 */
function convertV2RayToClashProxiesYAML(v2rayLinks) {
    if (!v2rayLinks || typeof v2rayLinks !== 'string') {
        console.error("输入无效，需要包含 V2Ray 链接的字符串。");
        return '';
    }

    const links = v2rayLinks.split(/\r?\n/).map(link => link.trim()).filter(link => link);
    const proxies = [];

    links.forEach((link, index) => {
        try {
            let proxy = null;
            if (link.startsWith('vmess://')) {
                proxy = parseVmessLink(link, index);
            } else if (link.startsWith('vless://')) {
                proxy = parseVlessLink(link, index);
            } else {
                console.warn(`跳过不支持的链接格式: ${link.substring(0, 30)}...`);
            }

            if (proxy) {
                proxies.push(proxy);
            }
        } catch (error) {
            console.error(`处理链接时出错 "${link.substring(0, 30)}...":`, error.message);
        }
    });

    if (proxies.length === 0) {
        console.log("没有成功转换任何有效的 V2Ray 节点。");
        return '';
    }

    // 创建基础的 Clash 配置结构 (仅 proxies)
    const clashConfig = {
        proxies: proxies
    };

    try {
        // 使用 js-yaml 生成 YAML 字符串
        // 注意：在 Node.js 中使用 require('js-yaml') 获取 jsyaml
        // 在浏览器中，假设 jsyaml 已通过 <script> 全局加载
        return jsyaml.dump(clashConfig, { indent: 2 });
    } catch (yamlError) {
        console.error("生成 YAML 时出错:", yamlError);
        // 回退为 JSON 字符串，以便至少能看到结果
        return JSON.stringify(clashConfig, null, 2);
    }
}

/**
* 解析 vmess:// 链接
* @param {string} link - vmess:// 链接
* @param {number} index - 链接索引，用于生成默认名称
* @returns {object | null} - Clash Proxy 对象或 null
*/
function parseVmessLink(link, index) {
  const encodedData = link.substring('vmess://'.length);
  let decodedString;
  try {
      // URL-safe Base64 decoding might be needed for some variants
      const base64String = encodedData.replace(/-/g, '+').replace(/_/g, '/');
      decodedString = atob(base64String); // Use built-in or polyfilled atob
  } catch (e) {
      console.error(`无法解码 Base64: ${encodedData.substring(0, 20)}...`, e);
      return null;
  }

  let vmessConfig;
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

  const proxy = {
      name: decodeURIComponent(vmessConfig.ps || `vmess_${index + 1}`),
      type: 'vmess',
      server: vmessConfig.add,
      port: parseInt(vmessConfig.port, 10),
      uuid: vmessConfig.id,
      alterId: parseInt(vmessConfig.aid || '0', 10),
      cipher: vmessConfig.scy || vmessConfig.security || 'auto', // 'security' is less common in URI JSON
      udp: true, // 默认开启 UDP，Clash 会处理
      tls: vmessConfig.tls === 'tls',
      'skip-cert-verify': vmessConfig.skipcert === 'true' || vmessConfig.allowInsecure === true, // vmessConfig.verify_cert === false is less common
      servername: vmessConfig.sni || (vmessConfig.tls === 'tls' ? vmessConfig.host || vmessConfig.add : undefined), // SNI, fallback to Host header or address if TLS
      network: vmessConfig.net || 'tcp', // 'tcp', 'ws', 'h2', 'grpc'
  };

  // WebSocket options
  if (proxy.network === 'ws') {
      proxy['ws-opts'] = {
          path: vmessConfig.path || '/',
          headers: {
              Host: vmessConfig.host || proxy.server // WS Host header
          }
      };
       // Early data header name (less common in standard URIs, requires specific Clash core)
       if (vmessConfig.path && vmessConfig.path.startsWith('/')) {
           // proxy['ws-opts']['early-data-header-name'] = 'Sec-WebSocket-Protocol';
           // proxy['ws-opts']['max-early-data'] = 2048; // Example value
       }
  }

  // HTTP/2 options
  if (proxy.network === 'h2') {
      proxy['h2-opts'] = {
          host: [vmessConfig.host || proxy.server], // h2 host list
          path: vmessConfig.path || '/'
      };
  }

  // gRPC options
  if (proxy.network === 'grpc') {
      proxy['grpc-opts'] = {
          'grpc-service-name': vmessConfig.path || vmessConfig.serviceName || '' // gRPC service name often in 'path' or 'serviceName'
      };
  }

   // Remove servername if TLS is off
  if (!proxy.tls) {
     delete proxy.servername;
     delete proxy['skip-cert-verify']; // skip-cert-verify only makes sense with TLS
  } else {
     // Ensure servername is set if TLS is on and SNI wasn't provided
     if (!proxy.servername) proxy.servername = proxy.server;
  }


  // Remove empty opts
  if (proxy['ws-opts'] && !proxy['ws-opts'].path && (!proxy['ws-opts'].headers || !proxy['ws-opts'].headers.Host)) delete proxy['ws-opts'];
  if (proxy['h2-opts'] && (!proxy['h2-opts'].path || !proxy['h2-opts'].host || proxy['h2-opts'].host.length === 0)) delete proxy['h2-opts'];
  if (proxy['grpc-opts'] && !proxy['grpc-opts']['grpc-service-name']) delete proxy['grpc-opts'];


  return proxy;
}

/**
* 解析 vless:// 链接
* @param {string} link - vless:// 链接
* @param {number} index - 链接索引，用于生成默认名称
* @returns {object | null} - Clash Proxy 对象或 null
*/
function parseVlessLink(link, index) {
  try {
      // Use URL constructor for robust parsing
      const url = new URL(link);

      if (!url.hostname || !url.port || !url.username) {
           console.warn(`跳过不完整的 VLESS 链接 (缺少 host, port, or uuid): ${link.substring(0, 50)}...`);
           return null;
      }

      const params = url.searchParams;

      const proxy = {
          name: url.hash ? decodeURIComponent(url.hash.substring(1)) : `vless_${index + 1}`,
          type: 'vless',
          server: url.hostname,
          port: parseInt(url.port, 10),
          uuid: url.username, // UUID is in the username part
          udp: true, // Default true
          tls: params.get('security') === 'tls' || params.get('security') === 'reality',
          'skip-cert-verify': params.get('allowInsecure') === '1' || params.get('allowInsecure') === 'true',
          servername: params.get('sni') || (params.get('security') === 'tls' || params.get('security') === 'reality' ? params.get('host') || url.hostname : undefined),
          network: params.get('type') || 'tcp', // ws, grpc, tcp, h2
          flow: params.get('flow') || undefined, // XTLS flow control (e.g., xtls-rprx-vision) - ensure your Clash core supports it
      };

       // Remove flow if empty or not needed
      if (!proxy.flow) delete proxy.flow;

      // WebSocket options
      if (proxy.network === 'ws') {
          proxy['ws-opts'] = {
              path: params.get('path') || '/',
              headers: {
                  Host: params.get('host') || proxy.server
              }
          };
           // Early data header name (less common in standard URIs, requires specific Clash core)
           if (params.get('path') && params.get('path').startsWith('/')) {
              // proxy['ws-opts']['early-data-header-name'] = 'Sec-WebSocket-Protocol';
              // proxy['ws-opts']['max-early-data'] = 2048; // Example value
           }
      }

      // gRPC options
      if (proxy.network === 'grpc') {
          proxy['grpc-opts'] = {
              'grpc-service-name': params.get('serviceName') || ''
          };
      }

      // h2 options
      if (proxy.network === 'h2') {
           proxy['h2-opts'] = {
               host: [params.get('host') || proxy.server],
               path: params.get('path') || '/'
           };
      }

      // REALITY options (requires Clash Meta core or similar)
      if (params.get('security') === 'reality') {
          proxy.tls = true; // REALITY implies TLS
          proxy['client-fingerprint'] = params.get('fp') || 'chrome'; // Fingerprint (e.g., chrome, firefox, safari, ios, android, random)
          const realityOpts = {};
          if (params.get('pbk')) {
              realityOpts['public-key'] = params.get('pbk');
          }
          if (params.get('sid')) {
              realityOpts['short-id'] = params.get('sid');
          }
           // 'spider-x' / 'spiderX' field name might vary depending on Clash core version
          if (params.get('spx')) {
               realityOpts['spider-x'] = params.get('spx');
          }

          if (Object.keys(realityOpts).length > 0) {
              proxy['reality-opts'] = realityOpts;
          }

          // If SNI is not explicitly set for REALITY, it should generally be left blank or set to a specific value based on config
          // Let's keep 'servername' as derived from 'sni' or 'host' if present, otherwise Clash might use server address or handle it.
          // If 'sni' is explicitly empty in the URI (?sni=), Clash might handle it correctly for REALITY.
          if (!params.has('sni') && !params.has('host')) {
             // delete proxy.servername; // Let clash decide or use default, maybe better? Or set to known good value? Or set to known good value? Test this.
             // If servername isn't set, Clash might use the server address, which could be wrong for REALITY.
             // It's often better to explicitly set SNI for REALITY, even if it's a common domain like www.google.com
             // Let's default servername to host if TLS/REALITY but no SNI/Host param provided
             if (!proxy.servername) proxy.servername = proxy.server;
          }


      } else {
          // Remove fingerprint if not REALITY
          delete proxy['client-fingerprint'];
      }


      // VLESS specific: encryption is usually 'none', not needed in Clash config unless explicitly other (rare for VLESS URI)
      // if (params.get('encryption') && params.get('encryption') !== 'none') {
      //    console.warn(`VLESS encryption "${params.get('encryption')}" found, usually 'none'. Clash config doesn't typically specify this for VLESS.`);
      // }

       // Remove servername if TLS is off
      if (!proxy.tls) {
         delete proxy.servername;
         delete proxy['skip-cert-verify']; // skip-cert-verify only makes sense with TLS
         delete proxy['client-fingerprint']; // fingerprint only makes sense with TLS/REALITY
         delete proxy['reality-opts'];
      } else {
          // Ensure servername is set if TLS/REALITY is on and SNI/Host wasn't provided in params
          if (!proxy.servername) proxy.servername = proxy.server;
      }


      // Remove empty opts
      if (proxy['ws-opts'] && !proxy['ws-opts'].path && (!proxy['ws-opts'].headers || !proxy['ws-opts'].headers.Host)) delete proxy['ws-opts'];
      if (proxy['grpc-opts'] && !proxy['grpc-opts']['grpc-service-name']) delete proxy['grpc-opts'];
      if (proxy['h2-opts'] && (!proxy['h2-opts'].path || !proxy['h2-opts'].host || proxy['h2-opts'].host.length === 0)) delete proxy['h2-opts'];
      if (proxy['reality-opts'] && Object.keys(proxy['reality-opts']).length === 0) delete proxy['reality-opts'];


      return proxy;

  } catch (error) {
      console.error(`解析 VLESS URL 时出错 "${link.substring(0, 50)}...":`, error);
      return null;
  }
}
const templatePath = path.join(__dirname, '../templates/template.yaml');
const template = fs.readFileSync(templatePath, 'utf8');


const v2rayNodes = `
// Node path here
`;

let config = jsyaml.load(template);
let proxies = jsyaml.load(convertV2RayToClashProxiesYAML(v2rayNodes)).proxies;

if(config.proxies){
    config.proxies = proxies
}
else{
    config["proxies"] = proxies
}

// add proxies to proxy-groups - 选择节点 - proxies
config['proxy-groups'].push({
    name: "🔰 选择节点",
    type: "select",
    proxies: proxies.map(proxy => proxy.name)
});

const clashProxiesYaml = jsyaml.dump(config, { indent: 2 });
// write to file
fs.writeFileSync('output.yaml', clashProxiesYaml);