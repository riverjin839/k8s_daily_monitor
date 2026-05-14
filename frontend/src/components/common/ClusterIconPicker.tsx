import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RotateCcw } from 'lucide-react';
import {
  CLUSTER_ICON_GROUPS,
  CLUSTER_EMOJI_GROUPS,
  resolveClusterIcon,
} from '@/lib/clusterIcons';

interface ClusterIconPickerProps {
  /** 현재 저장된 icon 값 (lucide 이름 / emoji / null). */
  value: string | null | undefined;
  /** 새 값 선택 시 호출. null 이면 기본값(자동 status 아이콘) 으로 되돌림. */
  onChange: (next: string | null) => void;
  onClose: () => void;
  /** 클러스터 이름 — 헤더에 표시. */
  clusterName?: string;
  /** popover 기준 좌표 — 우클릭 위치 등에서 띄울 때 사용. 지정하지 않으면 화면 중앙 모달. */
  anchorRect?: DOMRect | null;
}

type Tab = 'icons' | 'emoji';

const POPOVER_WIDTH = 360;
const POPOVER_MAX_HEIGHT = 520;

/** 클러스터 사이드바 아이콘을 사용자가 선택하는 picker.
 *  - lucide 아이콘 그리드 (화이트리스트)
 *  - emoji 입력 + 추천 그리드
 *  - "기본값으로 되돌리기" 버튼 (icon=null) */
export function ClusterIconPicker({
  value, onChange, onClose, clusterName, anchorRect,
}: ClusterIconPickerProps) {
  const resolved = resolveClusterIcon(value);
  const initialTab: Tab = resolved?.kind === 'text' ? 'emoji' : 'icons';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [emojiInput, setEmojiInput] = useState(resolved?.kind === 'text' ? resolved.value : '');
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ESC 로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 외부 클릭으로 닫기
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // 다음 tick 에서 등록 — 이번 클릭(picker 를 여는 클릭)을 먹지 않도록.
    const t = setTimeout(() => document.addEventListener('mousedown', onDocClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [onClose]);

  // anchor 기반 위치 계산 — viewport 안에 들어오도록 우측/아래 클램프
  const positionStyle = (() => {
    if (!anchorRect) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' } as React.CSSProperties;
    }
    let left = anchorRect.right + 8;
    let top = anchorRect.top;
    if (typeof window !== 'undefined') {
      if (left + POPOVER_WIDTH > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - POPOVER_WIDTH - 8);
      }
      if (top + POPOVER_MAX_HEIGHT > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - POPOVER_MAX_HEIGHT - 8);
      }
    }
    return { top, left } as React.CSSProperties;
  })();

  const handleSelectLucide = (name: string) => {
    onChange(name);
    onClose();
  };

  const handleSelectEmoji = (emoji: string) => {
    onChange(emoji);
    onClose();
  };

  const handleReset = () => {
    onChange(null);
    onClose();
  };

  const handleEmojiSubmit = () => {
    const v = emojiInput.trim();
    if (!v) {
      handleReset();
      return;
    }
    handleSelectEmoji(v);
  };

  return createPortal(
    <>
      {!anchorRect && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" aria-hidden />
      )}
      <div
        ref={containerRef}
        role="dialog"
        aria-label="클러스터 아이콘 선택"
        style={{ width: POPOVER_WIDTH, maxHeight: POPOVER_MAX_HEIGHT, ...positionStyle }}
        className="fixed z-[60] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">아이콘 선택</p>
            {clusterName && <p className="text-xs font-semibold truncate">{clusterName}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
            aria-label="닫기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border bg-secondary/30">
          <TabButton active={tab === 'icons'} onClick={() => setTab('icons')}>아이콘</TabButton>
          <TabButton active={tab === 'emoji'} onClick={() => setTab('emoji')}>이모지</TabButton>
          <button
            onClick={handleReset}
            className="ml-auto px-3 py-1.5 text-[11px] inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            title="status 기반 기본 아이콘으로 되돌리기"
          >
            <RotateCcw className="w-3 h-3" />
            기본값
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {tab === 'icons' ? (
            CLUSTER_ICON_GROUPS.map((group) => (
              <section key={group.key}>
                <header className="flex items-baseline gap-2 px-1 mb-1.5">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </h3>
                  {group.hint && (
                    <p className="text-[10px] text-muted-foreground/70 truncate">{group.hint}</p>
                  )}
                </header>
                <div className="grid grid-cols-7 gap-1">
                  {group.items.map(({ name, Component: Icon }) => {
                    const isActive = value === name;
                    return (
                      <button
                        key={name}
                        onClick={() => handleSelectLucide(name)}
                        title={name}
                        className={`flex items-center justify-center aspect-square rounded-md transition-colors ${
                          isActive
                            ? 'bg-primary/15 text-primary ring-1 ring-primary/40'
                            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-1 px-1">
                <input
                  type="text"
                  value={emojiInput}
                  onChange={(e) => setEmojiInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleEmojiSubmit(); }}
                  placeholder="이모지 1자 입력 (예: 🚀)"
                  maxLength={4}
                  className="flex-1 min-w-0 px-2 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={handleEmojiSubmit}
                  disabled={!emojiInput.trim()}
                  className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-40"
                >
                  적용
                </button>
              </div>
              {CLUSTER_EMOJI_GROUPS.map((group) => (
                <section key={group.key}>
                  <header className="flex items-baseline gap-2 px-1 mb-1.5">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </h3>
                    {group.hint && (
                      <p className="text-[10px] text-muted-foreground/70 truncate">{group.hint}</p>
                    )}
                  </header>
                  <div className="grid grid-cols-10 gap-1">
                    {group.items.map((e) => {
                      const isActive = value === e;
                      return (
                        <button
                          key={e}
                          onClick={() => handleSelectEmoji(e)}
                          title={e}
                          className={`flex items-center justify-center aspect-square rounded-md text-lg leading-none transition-colors ${
                            isActive
                              ? 'bg-primary/15 ring-1 ring-primary/40'
                              : 'hover:bg-secondary'
                          }`}
                        >
                          {e}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground/70">
          ESC · 외부 클릭으로 닫기
        </div>
      </div>
    </>,
    document.body,
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
        active
          ? 'text-primary border-primary'
          : 'text-muted-foreground border-transparent hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
