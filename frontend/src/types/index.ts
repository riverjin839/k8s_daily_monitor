// Status types
export type Status = 'healthy' | 'warning' | 'critical';

// Cluster
export interface Cluster {
  id: string;
  name: string;
  apiEndpoint: string;
  kubeconfigPath: string;
  status: Status;
  // 클러스터 관리 메타데이터
  region?: string;
  operationLevel?: string;
  maxPod?: number;
  ciliumConfig?: string;
  // Node CIDR
  cidr?: string;
  firstHost?: string;
  lastHost?: string;
  // Pod CIDR
  podCidr?: string;
  podFirstHost?: string;
  podLastHost?: string;
  // Service CIDR
  svcCidr?: string;
  svcFirstHost?: string;
  svcLastHost?: string;
  // NIC (bond0, bond1)
  bond0Ip?: string;
  bond0Mac?: string;
  bond1Ip?: string;
  bond1Mac?: string;
  description?: string;
  nodeCount?: number;
  hostname?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClusterManageUpdate {
  region?: string;
  operationLevel?: string;
  maxPod?: number;
  ciliumConfig?: string;
  cidr?: string;
  firstHost?: string;
  lastHost?: string;
  podCidr?: string;
  podFirstHost?: string;
  podLastHost?: string;
  svcCidr?: string;
  svcFirstHost?: string;
  svcLastHost?: string;
  bond0Ip?: string;
  bond0Mac?: string;
  bond1Ip?: string;
  bond1Mac?: string;
  description?: string;
  nodeCount?: number;
  hostname?: string;
}

// Addon
export interface Addon {
  id: string;
  clusterId: string;
  name: string;
  type: string;
  icon: string;
  description: string;
  status: Status;
  responseTime?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: Record<string, any>;
  lastCheck: string;
}

// Check Log
export interface CheckLog {
  id: string;
  clusterId: string;
  clusterName: string;
  addonId?: string;
  addonName?: string;
  status: Status;
  message: string;
  checkedAt: string;
}

// Summary Stats
export interface SummaryStats {
  totalClusters: number;
  healthy: number;
  warning: number;
  critical: number;
}

// API Response types
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Addon Config (for easy add/remove)
export interface AddonConfig {
  name: string;
  type: string;
  icon: string;
  description: string;
  checkPlaybook: string;
}

// Playbook
export interface Playbook {
  id: string;
  clusterId: string;
  name: string;
  description?: string;
  playbookPath: string;
  inventoryPath?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraVars?: Record<string, any>;
  tags?: string;
  status: string;  // healthy | warning | critical | unknown | running
  showOnDashboard: boolean;
  lastRunAt?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastResult?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybookRunResult {
  id: string;
  status: string;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stats?: Record<string, any>;
  durationMs: number;
}

// AI Agent
export interface AgentChatRequest {
  query: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context?: Record<string, any>;
}

export interface AgentChatResponse {
  status: 'ok' | 'offline';
  answer: string;
  model: string;
}

export interface AgentHealthResponse {
  status: 'online' | 'offline';
  detail?: string;
}

// PromQL Metric Card
export interface MetricCard {
  id: string;
  title: string;
  description?: string;
  icon: string;
  promql: string;
  unit: string;
  displayType: 'value' | 'gauge' | 'list';
  category: string;
  thresholds?: string;  // "warning:70,critical:90"
  grafanaPanelUrl?: string;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// Issue Board
export interface Issue {
  id: string;
  assignee: string;
  clusterId?: string;
  clusterName?: string;
  issueArea: string;
  issueContent: string;
  actionContent?: string;
  detailContent?: string;
  occurredAt: string;   // ISO date "YYYY-MM-DD"
  resolvedAt?: string;  // ISO date "YYYY-MM-DD"
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IssueListResponse {
  data: Issue[];
  total: number;
}

export interface IssueCreate {
  assignee: string;
  clusterId?: string;
  clusterName?: string;
  issueArea: string;
  issueContent: string;
  actionContent?: string;
  detailContent?: string;
  occurredAt: string;
  resolvedAt?: string | null;
  remarks?: string;
}

export interface IssueUpdate extends Partial<IssueCreate> {}

// Task Board
export type KanbanStatus = 'backlog' | 'todo' | 'in_progress' | 'review_test' | 'done';
export type TaskModule = 'k8s' | 'keycloak' | 'nexus' | 'cilium' | 'argocd' | 'jenkins' | 'backend' | 'frontend' | 'monitoring' | 'infra';
export type TaskTypeLabel = 'feature' | 'bug' | 'chore' | 'docs' | 'security';

export interface Task {
  id: string;
  assignee: string;
  clusterId?: string;
  clusterName?: string;
  taskCategory: string;
  taskContent: string;
  resultContent?: string;
  scheduledAt: string;
  completedAt?: string;
  priority: 'high' | 'medium' | 'low';
  remarks?: string;
  // 칸반 보드 필드
  kanbanStatus: KanbanStatus;
  module?: TaskModule;
  typeLabel?: TaskTypeLabel;
  effortHours?: number;
  doneCondition?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskListResponse {
  data: Task[];
  total: number;
}

export interface TaskStatusResponse {
  data: Task;
  wipWarning: boolean;
}

export interface TaskCreate {
  assignee: string;
  clusterId?: string;
  clusterName?: string;
  taskCategory: string;
  taskContent: string;
  resultContent?: string;
  scheduledAt: string;
  completedAt?: string | null;
  priority: string;
  remarks?: string;
  kanbanStatus?: KanbanStatus;
  module?: TaskModule;
  typeLabel?: TaskTypeLabel;
  effortHours?: number;
  doneCondition?: string;
}

export interface TaskUpdate extends Partial<TaskCreate> {}

export interface MetricQueryResult {
  cardId: string;
  status: 'ok' | 'error' | 'offline';
  value?: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  labels?: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  results?: Array<Record<string, any>> | null;
  error?: string | null;
}

export interface UiSettings {
  appTitle: string;
  navLabels: Record<string, string>;
}

// Workflow Board
export type WorkflowStepType = 'trigger' | 'action' | 'condition' | 'wait' | 'notification';
export type WorkflowStepStatus = 'idle' | 'running' | 'success' | 'failed' | 'skipped';

export interface WorkflowStep {
  id: string;
  workflowId: string;
  title: string;
  description?: string;
  completed: boolean;
  stepType: WorkflowStepType;
  status: WorkflowStepStatus;
  posX: number;
  posY: number;
  orderIndex: number;
  referenceType?: string;  // cluster / playbook / issue / task / work_guide / metric_card
  referenceId?: string;    // 참조 항목의 UUID
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowEdge {
  id: string;
  workflowId: string;
  sourceStepId: string;
  targetStepId: string;
  createdAt: string;
}

export interface Workflow {
  id: string;
  title: string;
  description?: string;
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowListResponse {
  data: Workflow[];
}

export interface WorkflowCreate {
  title: string;
  description?: string;
}

export interface WorkflowUpdate {
  title?: string;
  description?: string;
}

export interface WorkflowStepCreate {
  title: string;
  description?: string;
  completed?: boolean;
  stepType?: WorkflowStepType;
  status?: WorkflowStepStatus;
  posX?: number;
  posY?: number;
  orderIndex?: number;
  referenceType?: string;
  referenceId?: string;
}

export interface WorkflowStepUpdate {
  title?: string;
  description?: string;
  completed?: boolean;
  stepType?: WorkflowStepType;
  status?: WorkflowStepStatus;
  posX?: number;
  posY?: number;
  orderIndex?: number;
  referenceType?: string;
  referenceId?: string;
}

export interface WorkflowEdgeCreate {
  sourceStepId: string;
  targetStepId: string;
}

// Work Guide Board
export interface WorkGuide {
  id: string;
  title: string;
  content?: string;
  category?: string;   // 배포 / 트러블슈팅 / 모니터링 / 보안 / 기타
  priority: string;    // high / medium / low
  tags?: string;       // 쉼표 구분
  status: string;      // draft / active / archived
  author?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkGuideCreate {
  title: string;
  content?: string;
  category?: string;
  priority?: string;
  tags?: string;
  status?: string;
  author?: string;
}

export interface WorkGuideUpdate extends Partial<WorkGuideCreate> {}

export interface WorkGuideListResponse {
  data: WorkGuide[];
}

export interface ClusterLink {
  id: string;
  label: string;
  url: string;
  description?: string;
}

export interface ClusterLinkGroup {
  clusterId: string;
  clusterName: string;
  links: ClusterLink[];
}

export interface ClusterLinksPayload {
  commonLinks: ClusterLink[];
  clusterGroups: ClusterLinkGroup[];
}

// Ops Notes (업무 게시판)
export type OpsNoteColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

export interface OpsNote {
  id: string;
  service: string;
  title: string;
  content?: string;
  backContent?: string;
  color: OpsNoteColor;
  author?: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OpsNoteCreate {
  service: string;
  title: string;
  content?: string;
  backContent?: string;
  color: OpsNoteColor;
  author?: string;
  pinned?: boolean;
}

export interface OpsNoteUpdate extends Partial<OpsNoteCreate> {}

export interface OpsNoteListResponse {
  data: OpsNote[];
  total: number;
}

// Mind Map
export interface MindMapNode {
  id: string;
  mindmapId: string;
  parentId?: string | null;
  label: string;
  note?: string;
  color?: string;
  x?: number;
  y?: number;
  collapsed: boolean;
  sortOrder: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface MindMap {
  id: string;
  title: string;
  description?: string;
  nodes: MindMapNode[];
  createdAt: string;
  updatedAt: string;
}

export interface MindMapListItem {
  id: string;
  title: string;
  description?: string;
  nodeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MindMapCreate {
  title: string;
  description?: string;
}

export interface MindMapUpdate {
  title?: string;
  description?: string;
}

export interface MindMapNodeCreate {
  mindmapId: string;
  parentId?: string | null;
  label: string;
  note?: string;
  color?: string;
  x?: number;
  y?: number;
  collapsed?: boolean;
  sortOrder?: number;
}

export interface MindMapNodeUpdate {
  label?: string;
  note?: string;
  color?: string;
  x?: number;
  y?: number;
  collapsed?: boolean;
  sortOrder?: number;
  parentId?: string | null;
}
