import { AddonConfig } from '@/types';

/**
 * 애드온 설정
 * 새 애드온 추가: 이 배열에 객체 추가
 * 애드온 삭제: 이 배열에서 객체 제거
 * 애드온 수정: 해당 객체 속성 변경
 */
export const ADDON_CONFIGS: AddonConfig[] = [
  {
    name: 'API Server',
    type: 'core',
    icon: '🔌',
    description: 'Kubernetes API endpoint health',
    checkPlaybook: 'check_api_server.yml',
  },
  {
    name: 'etcd',
    type: 'core',
    icon: '💾',
    description: 'Distributed key-value store',
    checkPlaybook: 'check_etcd.yml',
  },
  {
    name: 'Controller Manager',
    type: 'core',
    icon: '🎛️',
    description: 'Kubernetes controller manager',
    checkPlaybook: 'check_controller.yml',
  },
  {
    name: 'Scheduler',
    type: 'core',
    icon: '📅',
    description: 'Pod scheduling service',
    checkPlaybook: 'check_scheduler.yml',
  },
  {
    name: 'Ingress Controller',
    type: 'networking',
    icon: '🌐',
    description: 'NGINX Ingress controller',
    checkPlaybook: 'check_ingress.yml',
  },
  {
    name: 'CoreDNS',
    type: 'networking',
    icon: '🔍',
    description: 'Cluster DNS service',
    checkPlaybook: 'check_coredns.yml',
  },
  {
    name: 'MinIO S3',
    type: 'storage',
    icon: '🪣',
    description: 'Object storage service',
    checkPlaybook: 'check_minio.yml',
  },
  {
    name: 'Metrics Server',
    type: 'monitoring',
    icon: '📈',
    description: 'Resource metrics pipeline',
    checkPlaybook: 'check_metrics.yml',
  },
  {
    name: 'Cert Manager',
    type: 'security',
    icon: '🔐',
    description: 'TLS certificate automation',
    checkPlaybook: 'check_certmanager.yml',
  },
  {
    name: 'ArgoCD',
    type: 'cicd',
    icon: '🚀',
    description: 'GitOps continuous delivery',
    checkPlaybook: 'check_argocd.yml',
  },
];

// 카테고리별 그룹화
export const ADDON_CATEGORIES = {
  core: 'Core Components',
  networking: 'Networking',
  storage: 'Storage',
  monitoring: 'Monitoring',
  security: 'Security',
  cicd: 'CI/CD',
} as const;

export type AddonCategory = keyof typeof ADDON_CATEGORIES;
