from __future__ import annotations

import json
from math import isfinite
from typing import Any


def json_size_bytes(value: Any) -> int:
    return len(
        json.dumps(
            value,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")
    )


def reject_non_finite_numbers(value: Any, *, field_name: str = "payload") -> None:
    validate_json_tree(value, field_name=field_name)


def validate_json_payload(
    value: Any,
    *,
    field_name: str,
    max_bytes: int,
    max_depth: int | None = None,
    max_nodes: int | None = None,
) -> None:
    validate_json_tree(
        value,
        field_name=field_name,
        max_depth=max_depth,
        max_nodes=max_nodes,
    )
    try:
        payload_size = json_size_bytes(value)
    except (RecursionError, TypeError, ValueError) as error:
        raise ValueError(f"{field_name} 必须是可序列化 JSON") from error
    if payload_size > max_bytes:
        raise ValueError(f"{field_name} 不能超过 {max_bytes} 字节")


def validate_json_tree(
    value: Any,
    *,
    field_name: str,
    max_depth: int | None = None,
    max_nodes: int | None = None,
) -> None:
    nodes_seen = 0
    stack: list[tuple[Any, int]] = [(value, 1)]
    while stack:
        current_value, depth = stack.pop()
        nodes_seen += 1
        if max_nodes is not None and nodes_seen > max_nodes:
            raise ValueError(f"{field_name} 复杂度不能超过 {max_nodes} 个节点")
        if max_depth is not None and depth > max_depth:
            raise ValueError(f"{field_name} 嵌套深度不能超过 {max_depth}")
        if isinstance(current_value, float) and not isfinite(current_value):
            raise ValueError(f"{field_name} 不能包含 NaN 或 Infinity")
        if isinstance(current_value, dict):
            stack.extend((nested_value, depth + 1) for nested_value in current_value.values())
        elif isinstance(current_value, list | tuple):
            stack.extend((nested_value, depth + 1) for nested_value in current_value)
