export interface ClientInfo {
  id: number;
  inboundId: number;
  enable: boolean;
  email: string;
  up: number;
  down: number;
  total: number;
  expiryTime: number;
}

export interface Inbound {
  id: number;
  up: number;
  down: number;
  total: number;
  remark: string;
  enable: boolean;
  expiryTime: number;
  autoreset: boolean;
  ipalert: boolean;
  iplimit: number;
  clientInfo: ClientInfo[];
  listen: string;
  port: number;
  protocol: string;
  settings: string;
  streamSettings: string;
  tag: string;
  sniffing: string;
}

export interface XUIResponse {
  success: boolean;
  msg: string;
  obj: Inbound[];
}

export interface SubscriptionUserInfo {
  upload: number;
  download: number;
  total: number;
  expire: number;
}

export interface Proxy {
  name: string;
  type: string;
  server: string;
  port: number;
  uuid: string;
  alterId?: number;
  cipher?: string;
  udp?: boolean;
  tls?: boolean;
  'skip-cert-verify'?: boolean;
  servername?: string;
  network?: string;
  flow?: string;
  'client-fingerprint'?: string;
  'reality-opts'?: {
    'public-key'?: string;
    'short-id'?: string;
    'spider-x'?: string;
  };
  'ws-opts'?: {
    path?: string;
    headers?: {
      Host?: string;
    };
  };
  'grpc-opts'?: {
    'grpc-service-name'?: string;
  };
  'h2-opts'?: {
    host?: string[];
    path?: string;
  };
} 