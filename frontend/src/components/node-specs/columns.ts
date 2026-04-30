/**
 * 노드 서버스펙 대장 — 테이블 컬럼 / CSV 컬럼 / 붙여넣기 매핑의 **단일 소스**.
 *
 * 여기에 정의된 `COLUMNS` 가:
 *   1) NodeSpecPage 의 export CSV 헤더/값
 *   2) NodeSpecCsvUploadModal 의 업로드 파싱 alias
 *   3) Excel TSV 붙여넣기 매핑
 * 세 곳에서 동일하게 쓰인다. 테이블에 항목을 추가할 때는 여기만 수정하면 된다.
 */

import type { NodeServerSpec } from '@/types';

export type CellType = 'string' | 'number' | 'boolean' | 'date';

export interface NodeSpecColumn {
  /** 프론트엔드 camelCase 필드명 (NodeServerSpec 의 키) */
  field: keyof NodeServerSpec;
  /** CSV 헤더에 쓰이는 snake_case 이름 */
  csvKey: string;
  /** UI 라벨 (한글 라벨 alias 매칭에도 사용) */
  label: string;
  /** 타입 — CSV/TSV 파싱 + 직렬화에 영향 */
  type: CellType;
  /** 업로드 시 추가로 인식할 헤더 이름들 (한글 포함) */
  aliases?: string[];
  /** 인라인 편집 허용 여부 */
  editable?: boolean;
}

export const NODE_SPEC_COLUMNS: NodeSpecColumn[] = [
  { field: 'hostname',          csvKey: 'hostname',          label: '호스트명',        type: 'string', aliases: ['host'],             editable: false },
  { field: 'nodeName',          csvKey: 'node_name',         label: 'k8s 노드명',      type: 'string', aliases: ['k8s_node'],         editable: true },
  { field: 'clusterName',       csvKey: 'cluster',           label: '클러스터',        type: 'string', aliases: ['클러스터이름'],        editable: false },
  { field: 'role',              csvKey: 'role',              label: '역할',            type: 'string', aliases: ['역할'],              editable: true },
  { field: 'status',            csvKey: 'status',            label: '상태',            type: 'string', aliases: ['상태'],              editable: true },

  // 네트워크 — 사용자 요청: bond0 = public IP, bond1 = private IP 로 명명.
  { field: 'bond0Ip',           csvKey: 'public_ip',         label: 'public IP (bond0)', type: 'string', aliases: ['bond0_ip', 'public', 'publicip', 'bond0'], editable: true },
  { field: 'bond1Ip',           csvKey: 'private_ip',        label: 'private IP (bond1)', type: 'string', aliases: ['bond1_ip', 'private', 'privateip', 'bond1'], editable: true },
  { field: 'bond0Mac',          csvKey: 'bond0_mac',         label: 'bond0 MAC',       type: 'string',                                editable: true },
  { field: 'bond0Speed',        csvKey: 'bond0_speed',       label: 'bond0 속도',      type: 'string',                                editable: true },
  { field: 'bond1Mac',          csvKey: 'bond1_mac',         label: 'bond1 MAC',       type: 'string',                                editable: true },
  { field: 'bond1Speed',        csvKey: 'bond1_speed',       label: 'bond1 속도',      type: 'string',                                editable: true },
  // 호환을 위해 internal/external/bmc 는 alias 만 받음 (대시보드 표시 X). 기존 CSV 도 무시되지 않도록.
  { field: 'internalIp',        csvKey: 'internal_ip',       label: '내부 IP',         type: 'string', aliases: ['ip', '내부ip'],      editable: true },
  { field: 'externalIp',        csvKey: 'external_ip',       label: '외부 IP',         type: 'string', aliases: ['외부ip'],            editable: true },

  // CPU
  { field: 'cpuModel',          csvKey: 'cpu_model',         label: 'CPU 모델',         type: 'string', aliases: ['cpu모델'],           editable: true },
  { field: 'cpuSockets',        csvKey: 'cpu_sockets',       label: 'CPU 소켓',         type: 'number', aliases: ['sockets', '소켓'],   editable: true },
  { field: 'cpuCores',          csvKey: 'cpu_cores',         label: 'CPU 코어',         type: 'number', aliases: ['cores', '코어'],     editable: true },
  { field: 'cpuThreads',        csvKey: 'cpu_threads',       label: 'CPU 스레드',        type: 'number', aliases: ['threads', '스레드'], editable: true },
  // RAM
  { field: 'memoryGb',          csvKey: 'memory_gb',         label: '메모리(GB)',       type: 'number', aliases: ['memory', 'ram_gb', '메모리', 'ram'], editable: true },
  { field: 'memoryModules',     csvKey: 'memory_modules',    label: '메모리 모듈',       type: 'string',                                editable: true },

  // DISK (GPU 항목 제거)
  { field: 'diskTotalGb',       csvKey: 'disk_total_gb',     label: 'DISK 총용량(GB)',  type: 'number', aliases: ['disk_total', 'disk', 'disk총용량', '디스크'], editable: true },
  { field: 'nonOsDiskGb',       csvKey: 'non_os_disk_gb',    label: 'OS제외 DISK(GB)',  type: 'number', aliases: ['data_disk_gb', 'os제외디스크', 'data디스크'], editable: true },
  { field: 'diskType',          csvKey: 'disk_type',         label: '디스크 종류',       type: 'string', aliases: ['디스크종류'],         editable: true },
  { field: 'diskCount',         csvKey: 'disk_count',        label: '디스크 개수',       type: 'number',                                editable: true },
  { field: 'raidConfig',        csvKey: 'raid_config',       label: 'RAID',            type: 'string', aliases: ['raid'],              editable: true },

  // 분류
  { field: 'isSsd',             csvKey: 'ssd',               label: 'SSD',             type: 'boolean', aliases: ['is_ssd'],           editable: true },
  { field: 'isVm',              csvKey: 'vm',                label: 'VM',              type: 'boolean', aliases: ['is_vm'],            editable: true },

  // 위치
  { field: 'datacenter',        csvKey: 'datacenter',        label: '데이터센터',       type: 'string', aliases: ['dc'],               editable: true },
  { field: 'room',              csvKey: 'room',              label: 'Room',            type: 'string',                                editable: true },
  { field: 'rack',              csvKey: 'rack',              label: 'Rack',            type: 'string', aliases: ['랙'],               editable: true },
  { field: 'rackUnit',          csvKey: 'rack_unit',         label: 'U',               type: 'string', aliases: ['u'],                editable: true },

  // OS / 런타임
  { field: 'osImage',           csvKey: 'os',                label: 'OS',              type: 'string', aliases: ['os_image', 'os이미지'], editable: true },
  { field: 'kernelVersion',     csvKey: 'kernel',            label: 'Kernel',          type: 'string', aliases: ['kernel_version'],    editable: true },
  { field: 'kubeletVersion',    csvKey: 'kubelet',           label: 'Kubelet',         type: 'string', aliases: ['kubelet_version'],   editable: true },
  { field: 'containerRuntime',  csvKey: 'runtime',           label: 'Runtime',         type: 'string', aliases: ['container_runtime'], editable: true },

  // 운영 메모 — 자산/계약 항목(asset_tag/purchase_date/warranty_end/owner/purchase_purpose) 은 사용자 요청으로 제거.
  // currentUsage 는 운영적 의미(이 노드의 용도) 라 유지.
  { field: 'currentUsage',      csvKey: 'current_usage',     label: '현재 용도',        type: 'string', aliases: ['용도', '현재용도'],   editable: true },
  { field: 'description',       csvKey: 'description',       label: '메모',            type: 'string', aliases: ['설명', '비고'],       editable: true },
];

/** CSV 내보내기에 쓸 컬럼 (clusterName 제외 — cluster_id 로 replaceable 하지만 혼동 방지) */
export const EXPORT_COLUMNS: NodeSpecColumn[] = NODE_SPEC_COLUMNS.filter((c) => c.field !== 'clusterName');

// ── 헤더 alias → field 맵 ──────────────────────────────────────────────
export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export const HEADER_TO_FIELD: Record<string, keyof NodeServerSpec> = (() => {
  const map: Record<string, keyof NodeServerSpec> = {};
  for (const c of NODE_SPEC_COLUMNS) {
    map[normalizeHeader(c.csvKey)] = c.field;
    map[normalizeHeader(c.label)] = c.field;
    map[normalizeHeader(String(c.field))] = c.field;
    for (const alias of c.aliases ?? []) {
      map[normalizeHeader(alias)] = c.field;
    }
  }
  return map;
})();

// ── 값 파서 / 직렬화 ──────────────────────────────────────────────────
export function parseCellValue(raw: string, col: NodeSpecColumn): unknown {
  const v = raw.trim();
  if (v === '') return null;
  if (col.type === 'number') {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`숫자 아님: "${v}"`);
    return n;
  }
  if (col.type === 'boolean') {
    const s = v.toLowerCase();
    if (['o', 'y', 'yes', 'true', '1', 'ssd', 'vm', 'on'].includes(s)) return true;
    if (['x', 'n', 'no', 'false', '0', 'off', 'bare', '-'].includes(s)) return false;
    return null;
  }
  if (col.type === 'date') {
    // YYYY-MM-DD 또는 YYYY/MM/DD
    const m = v.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
    if (!m) throw new Error(`날짜 형식 아님: "${v}"`);
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return v;
}

export function serializeCellValue(v: unknown, col: NodeSpecColumn): string {
  if (v === null || v === undefined) return '';
  if (col.type === 'boolean') return v ? 'O' : 'X';
  if (col.type === 'date' && typeof v === 'string') return v;
  return String(v);
}
