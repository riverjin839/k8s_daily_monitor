"""
Ollama 기반 한국어 요약기
- 외부망/폐쇄망 모두 로컬 Ollama 사용
- Ollama 불가 시 원문 제목 반환 (fail-safe)
"""
import logging
import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_ITEM_PROMPT = """다음은 Kubernetes/Linux/클라우드 네이티브 분야의 기술 변경사항입니다.
핵심 내용을 한국어로 3~5문장으로 간결하게 요약해주세요.
버전, 주요 변경사항, 영향도를 중심으로 작성하세요.

제목: {title}
내용:
{content}

한국어 요약:"""

_DIGEST_PROMPT = """다음은 오늘({date}) 수집된 기술 동향 목록입니다.
전체를 3~7문장으로 한국어 요약해주세요.
중요 릴리즈와 주목할 변경사항을 중심으로 작성하세요.

{items}

오늘의 종합 동향:"""


async def summarize_item(title: str, content: str) -> str:
    """단일 아이템 한국어 요약"""
    prompt = _ITEM_PROMPT.format(title=title, content=content[:1500])
    result = await _call_ollama(prompt)
    return result or f"[{title}] 요약을 생성할 수 없습니다."


async def summarize_digest(digest_date: str, items: list[dict]) -> str:
    """하루 전체 동향 종합 요약"""
    lines = "\n".join(
        f"- [{i['category'].upper()}] {i['title']}" + (f" ({i['version']})" if i.get("version") else "")
        for i in items
    )
    prompt = _DIGEST_PROMPT.format(date=digest_date, items=lines[:3000])
    result = await _call_ollama(prompt)
    return result or "오늘 수집된 동향의 종합 요약을 생성할 수 없습니다."


async def _call_ollama(prompt: str) -> str | None:
    payload = {
        "model": settings.ollama_model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.3, "num_predict": 512},
    }
    try:
        async with httpx.AsyncClient(timeout=settings.ollama_timeout) as client:
            r = await client.post(f"{settings.ollama_url}/api/generate", json=payload)
            r.raise_for_status()
            return r.json().get("response", "").strip()
    except Exception as e:
        logger.warning("Ollama 요약 실패: %s", e)
        return None
