"""Сопоставление System.AreaPath с доской TFS (team board)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


class BoardLike(Protocol):
    id: str
    name: str
    area_path: str | None


@dataclass(frozen=True, slots=True)
class BoardSnapshot:
    """Снимок доски без привязки к SQLAlchemy Session."""

    id: str
    name: str
    area_path: str | None


def board_snapshots_from_rows(rows: list[Any]) -> list[BoardSnapshot]:
    return [
        BoardSnapshot(id=row.id, name=row.name, area_path=row.area_path)
        for row in rows
    ]


def board_snapshots_from_payloads(items: list[dict[str, Any]]) -> list[BoardSnapshot]:
    result: list[BoardSnapshot] = []
    for item in items:
        board_id = item.get("id")
        if not isinstance(board_id, str):
            continue
        result.append(
            BoardSnapshot(
                id=board_id,
                name=str(item.get("name") or board_id),
                area_path=item.get("area_path") if isinstance(item.get("area_path"), str) else None,
            )
        )
    return result


def normalize_area_path(area_path: str) -> str:
    return area_path.replace("/", "\\").strip().lower()


def area_path_parts(area_path: str) -> list[str]:
    return [part.strip().lower() for part in area_path.replace("/", "\\").split("\\") if part.strip()]


def guess_area_path_from_board_name(board_name: str, project: str = "Tele2") -> str | None:
    """Эвристика для досок Digital Streams*, если REST teamsettings недоступен."""
    name = board_name.strip()
    if not name:
        return None
    if name == "Digital Inbox":
        return f"{project}\\Digital\\Streams\\Inbox"
    if name.startswith("Digital Streams "):
        leaf = name[len("Digital Streams ") :].strip()
        if leaf:
            return f"{project}\\Digital\\Streams\\{leaf}"
    # Короткие имена команд на /_boards/directory (Service, eCommerce, Product_1, …)
    if name in {"Service", "eCommerce", "Inbox", "B2b", "B2B", "DS"} or name.startswith("Product"):
        leaf = "Inbox" if name == "Inbox" else name
        return f"{project}\\Digital\\Streams\\{leaf}"
    return None


def streams_board_display_name(area_path: str) -> str:
    """Человекочитаемое имя доски по System.AreaPath (Streams\\Service → Digital Streams Service)."""
    raw_parts = [part.strip() for part in area_path.replace("/", "\\").split("\\") if part.strip()]
    lower_parts = [part.lower() for part in raw_parts]
    stream_idx = next((index for index, part in enumerate(lower_parts) if part == "streams"), None)
    if stream_idx is not None and stream_idx + 1 < len(raw_parts):
        leaf = raw_parts[stream_idx + 1]
        if leaf.lower() == "inbox":
            return "Digital Inbox"
        return f"Digital Streams {leaf}"
    return raw_parts[-1] if raw_parts else area_path


def board_for_area(boards: list[BoardLike], area_path: str | None) -> BoardLike | None:
    if not area_path or not boards:
        return None

    normalized = normalize_area_path(area_path)
    parts = area_path_parts(area_path)

    best: BoardLike | None = None
    best_len = -1
    for board in boards:
        if not board.area_path:
            continue
        prefix = normalize_area_path(board.area_path)
        if normalized.startswith(prefix) and len(prefix) > best_len:
            best = board
            best_len = len(prefix)
    if best:
        return best

    if parts:
        leaf = parts[-1]
        leaf_matches = [board for board in boards if board.name.strip().lower() == leaf]
        if len(leaf_matches) == 1:
            return leaf_matches[0]

    stream_idx = next((index for index, part in enumerate(parts) if part == "streams"), None)
    if stream_idx is not None and stream_idx + 1 < len(parts):
        stream_leaf = parts[stream_idx + 1]
        candidates: list[BoardLike] = []
        for board in boards:
            tokens = board.name.lower().replace("-", " ").split()
            if stream_leaf in tokens:
                candidates.append(board)
        if len(candidates) == 1:
            return candidates[0]
        if len(candidates) > 1:
            return max(candidates, key=lambda board: len(board.name))

    return None
