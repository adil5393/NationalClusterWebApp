"""Pydantic schemas + controlled vocabularies shared by public and admin APIs."""
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator

# --- Controlled vocabularies (kept in code so the frontend can fetch them) ---
KNOWLEDGE_CATEGORIES = [
    "Procurement", "Accommodation", "Food", "Transport", "Event", "Website",
    "Security", "Medical", "Cleaning", "Finance", "Staffing", "General",
]
KNOWLEDGE_STATUSES = [
    "Idea", "Discussion", "Pending", "Decided", "In Progress", "Completed", "Cancelled",
]
PROCUREMENT_STATUSES = [
    "Open", "Researching", "Quoted", "Ordered", "Received", "Cancelled",
]
ANNOUNCEMENT_PRIORITIES = ["low", "normal", "high", "urgent"]
ANNOUNCEMENT_AUDIENCES = ["everyone", "team", "organizers", "staff", "coaches"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Teams ---
class TeamBase(BaseModel):
    name: str
    school: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = "India"
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    member_count: Optional[int] = 0
    notes: Optional[str] = None


class TeamCreate(TeamBase):
    pass


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    school: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    member_count: Optional[int] = None
    notes: Optional[str] = None


class TeamRead(ORMModel, TeamBase):
    id: int
    created_at: datetime
    updated_at: datetime


class TeamPublic(ORMModel):
    id: int
    name: str
    school: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    member_count: Optional[int] = None


# --- Buildings / Floors / Rooms ---
class RoomBase(BaseModel):
    name: str
    capacity: Optional[int] = 0
    room_type: Optional[str] = None
    notes: Optional[str] = None


class RoomCreate(RoomBase):
    pass


class RoomRead(ORMModel, RoomBase):
    id: int
    floor_id: int


class FloorBase(BaseModel):
    name: str
    level: Optional[int] = 0
    notes: Optional[str] = None


class FloorCreate(FloorBase):
    pass


class FloorRead(ORMModel, FloorBase):
    id: int
    building_id: int
    rooms: List[RoomRead] = []


class BuildingBase(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None


class BuildingCreate(BuildingBase):
    pass


class BuildingRead(ORMModel, BuildingBase):
    id: int
    floors: List[FloorRead] = []


# --- Knowledge Base ---
class KnowledgeBase(BaseModel):
    title: str
    category: str = "General"
    status: str = "Idea"
    description: Optional[str] = None
    decision: Optional[str] = None
    reason: Optional[str] = None
    owner: Optional[str] = None
    tags: List[str] = []
    notes: Optional[str] = None


class KnowledgeCreate(KnowledgeBase):
    pass


class KnowledgeUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None
    decision: Optional[str] = None
    reason: Optional[str] = None
    owner: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None


class KnowledgeRead(ORMModel):
    id: int
    title: str
    category: str
    status: str
    description: Optional[str] = None
    decision: Optional[str] = None
    reason: Optional[str] = None
    owner: Optional[str] = None
    tags: List[str] = []
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @field_validator("tags", mode="before")
    @classmethod
    def split_tags(cls, v):
        if isinstance(v, str):
            return [t.strip() for t in v.split(",") if t.strip()]
        return v or []


# --- Procurement ---
class ProcurementBase(BaseModel):
    title: str
    category: Optional[str] = "General"
    status: str = "Open"
    quantity: Optional[int] = None
    target_unit_price: Optional[Decimal] = None
    max_budget: Optional[Decimal] = None
    currency: Optional[str] = "INR"
    supplier: Optional[str] = None
    owner: Optional[str] = None
    notes: Optional[str] = None


class ProcurementCreate(ProcurementBase):
    pass


class ProcurementUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    quantity: Optional[int] = None
    target_unit_price: Optional[Decimal] = None
    max_budget: Optional[Decimal] = None
    currency: Optional[str] = None
    supplier: Optional[str] = None
    owner: Optional[str] = None
    notes: Optional[str] = None


class ProcurementRead(ORMModel, ProcurementBase):
    id: int
    created_at: datetime
    updated_at: datetime


# --- Announcements ---
class AnnouncementBase(BaseModel):
    title: str
    message: str
    priority: str = "normal"
    audience: str = "everyone"
    is_published: bool = True
    expires_at: Optional[datetime] = None


class AnnouncementCreate(AnnouncementBase):
    pass


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    priority: Optional[str] = None
    audience: Optional[str] = None
    is_published: Optional[bool] = None
    expires_at: Optional[datetime] = None


class AnnouncementRead(ORMModel, AnnouncementBase):
    id: int
    published_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
