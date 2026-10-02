from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional

@dataclass
class Period:
    id: int
    label: str
    time: str
    is_break: bool = False

@dataclass
class ScheduleConfig:
    days: List[str]
    periods: List[Period]

    @property
    def teaching_periods(self) -> List[Period]:
        return [p for p in self.periods if not p.is_break]

@dataclass
class Batch:
    id: str
    name: str
    sub_batches: List[str] = field(default_factory=list)  # e.g. ["H1", "H2", "H3"]
    capacity: int = 75

@dataclass
class Teacher:
    id: str
    name: str
    short: str
    dept: str

@dataclass
class Room:
    id: str
    name: str
    type: str  # "Lecture" or "Lab"
    capacity: int = 60

@dataclass
class Subject:
    id: str
    code: str
    name: str
    teacher_id: str
    batch_id: str             # e.g. "SE", "TE", "BE"
    weekly_hours: int
    is_lab: bool = False
    sub_batch_id: Optional[str] = None  # e.g. "H1", "H2", "H3" or None for whole class
    color: str = "#2563eb"

@dataclass
class ScheduledSlot:
    day: str
    period_id: int
    subject_id: str
    teacher_id: str
    room_id: str
    batch_id: str
    sub_batch_id: Optional[str] = None
    is_lab: bool = False

    def to_dict(self) -> dict:
        return asdict(self)
