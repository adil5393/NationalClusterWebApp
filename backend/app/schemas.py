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
DUTY_TYPES = ["Fooding", "Lodging", "Cleaning", "Medical", "Security", "Transport", "Reception", "Electricity"]
# A staff member's broad category (who they are) — separate from duty_type (what
# they're doing on a given assignment, e.g. Fooding/Lodging), which is decided at
# allotment time, not when the person is added.
STAFF_CATEGORIES = ["Academic & Administrative", "Support & Housekeeping", "Transport"]


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
    school_code: Optional[str] = None
    participant_count: Optional[int] = None
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


# --- Accommodation assignments ---
class AssignmentCreate(BaseModel):
    room_id: int
    team_id: Optional[int] = None
    participant_id: Optional[int] = None
    bed_id: Optional[int] = None
    notes: Optional[str] = None


class BedCreate(BaseModel):
    label: str
    notes: Optional[str] = None


class ScheduleEventCreate(BaseModel):
    title: str
    team_id: Optional[int] = None
    venue_id: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    description: Optional[str] = None


class ScheduleEventUpdate(BaseModel):
    title: Optional[str] = None
    team_id: Optional[int] = None
    venue_id: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    description: Optional[str] = None


class VenueCreate(BaseModel):
    name: str
    venue_type: Optional[str] = None
    capacity: Optional[int] = None
    location: Optional[str] = None
    description: Optional[str] = None


class VenueUpdate(BaseModel):
    name: Optional[str] = None
    venue_type: Optional[str] = None
    capacity: Optional[int] = None
    location: Optional[str] = None
    description: Optional[str] = None


class VenueRead(ORMModel, VenueCreate):
    id: int


# --- Knowledge comments ---
class CommentCreate(BaseModel):
    author: Optional[str] = "Organizer"
    body: str


# --- Documents (link only; uploads use multipart form) ---
class DocumentLinkCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    external_url: str
    knowledge_item_id: Optional[int] = None


# --- Participants ---
class ParticipantBase(BaseModel):
    team_id: int
    full_name: str
    gender: Optional[str] = None
    age: Optional[int] = None
    age_group: Optional[str] = None
    role: Optional[str] = None
    notes: Optional[str] = None


class ParticipantCreate(ParticipantBase):
    pass


class ParticipantUpdate(BaseModel):
    team_id: Optional[int] = None
    full_name: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[int] = None
    age_group: Optional[str] = None
    role: Optional[str] = None
    notes: Optional[str] = None


class ParticipantRead(ORMModel, ParticipantBase):
    id: int
    registration_no: Optional[str] = None


# --- Transport ---
class DriverBase(BaseModel):
    name: str
    phone: Optional[str] = None
    license_no: Optional[str] = None
    notes: Optional[str] = None


class DriverCreate(DriverBase):
    pass


class DriverRead(ORMModel, DriverBase):
    id: int


class VehicleCreate(BaseModel):
    label: str
    vehicle_type: Optional[str] = None
    capacity: Optional[int] = None
    driver_id: Optional[int] = None
    notes: Optional[str] = None


class TransportAssignmentCreate(BaseModel):
    vehicle_id: int
    team_id: Optional[int] = None
    pickup_location: Optional[str] = None
    drop_location: Optional[str] = None
    pickup_time: Optional[datetime] = None
    route: Optional[str] = None
    notes: Optional[str] = None


# --- Staff & Duties ---
class StaffBase(BaseModel):
    full_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None


class StaffCreate(StaffBase):
    pass


class StaffUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None


class StaffRead(ORMModel, StaffBase):
    id: int


class DutyAssignmentCreate(BaseModel):
    staff_id: int
    room_id: int
    duty_type: str
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    notes: Optional[str] = None


class DutyAssignmentUpdate(BaseModel):
    staff_id: Optional[int] = None
    room_id: Optional[int] = None
    duty_type: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    notes: Optional[str] = None


# --- Organizer accounts (individual Organizer Portal logins) ---
# Fixed catalog of gate-able admin modules -> (label, backing router(s)). Kept in
# code (like STAFF_CATEGORIES etc. above) so the frontend can build the
# permission-matrix editor from the same source of truth as the backend gate.
ORGANIZER_MODULES = {
    "teams": "Teams & Participants",
    "accommodation": "Accommodation",
    "buildings": "Buildings & Rooms",
    "staff": "Staff & Duties",
    "transport": "Transport",
    "venues": "Venues",
    "schedule": "Schedule",
    "announcements": "Announcements",
    "procurement": "Procurement",
    "knowledge": "Knowledge Base",
}
PERMISSION_LEVELS = ["view", "edit"]  # a module key missing from `permissions` means no access


class OrganizerUserCreate(BaseModel):
    username: str
    full_name: Optional[str] = None
    password: str
    is_active: bool = True
    is_admin: bool = False
    permissions: dict[str, str] = {}

    @field_validator("permissions")
    @classmethod
    def valid_permissions(cls, v: dict[str, str]) -> dict[str, str]:
        for module, level in v.items():
            if module not in ORGANIZER_MODULES:
                raise ValueError(f"Unknown module '{module}'")
            if level not in PERMISSION_LEVELS:
                raise ValueError(f"Invalid permission level '{level}' for '{module}'")
        return v


class OrganizerUserUpdate(BaseModel):
    username: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None  # set to change/reset the password; omit to leave it
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None
    permissions: Optional[dict[str, str]] = None

    @field_validator("permissions")
    @classmethod
    def valid_permissions(cls, v):
        if v is None:
            return v
        for module, level in v.items():
            if module not in ORGANIZER_MODULES:
                raise ValueError(f"Unknown module '{module}'")
            if level not in PERMISSION_LEVELS:
                raise ValueError(f"Invalid permission level '{level}' for '{module}'")
        return v


class OrganizerUserRead(ORMModel):
    id: int
    username: str
    full_name: Optional[str] = None
    is_active: bool
    is_admin: bool
    permissions: dict[str, str] = {}
    created_at: datetime
