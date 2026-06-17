"""应用状态管理"""
from dataclasses import dataclass, field
from core.data_manager import np

@dataclass
class NavState:
    stack: list[tuple[str,str]] = field(default_factory=list)  # [(path, display_name)]

    def push(self, path: str, name: str):
        path = np(path)
        for i, (p, _) in enumerate(self.stack):
            if p == path:
                self.stack = self.stack[:i+1]
                return
        self.stack.append((path, name))

    def reset(self, path: str, name: str):
        self.stack = [(np(path), name)]

    def pop(self) -> tuple[str,str] | None:
        if len(self.stack) > 1:
            self.stack.pop()
            return self.stack[-1]
        return None

    @property
    def current(self) -> tuple[str,str] | None:
        return self.stack[-1] if self.stack else None

    @property
    def is_root(self) -> bool:
        return len(self.stack) <= 1
