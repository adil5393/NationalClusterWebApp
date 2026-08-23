"""SQLAlchemy ORM models: the normalized relational schema for Cluster Nationals.

This models the full domain so the schema is future-ready (Phase 2+), while only a
subset has full CRUD wired in Phase 1.
"""
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from .database import Base


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Event(TimestampMixin, Base):
    __tablename__ = "events"
    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    subtitle = Column(String(300))
    start_date = Column(DateTime(timezone=True))
    end_date = Column(DateTime(timezone=True))
    location = Column(String(300))
    description = Column(Text)


class Team(TimestampMixin, Base):
    __tablename__ = "teams"
    id = Column(Integer, primary_key=True)
    school_code = Column(String(40), unique=True, index=True)
    name = Column(String(200), nullable=False)
    school = Column(String(200))
    region = Column(String(120))
    country = Column(String(120), default="India")
    contact_name = Column(String(160))
    contact_email = Column(String(200))
    contact_phone = Column(String(60))
    member_count = Column(Integer, default=0)
    notes = Column(Text)

    participants = relationship("Participant", back_populates="team", cascade="all, delete-orphan")
    coaches = relationship("Coach", back_populates="team", cascade="all, delete-orphan")
    accommodation = relationship("AccommodationAssignment", back_populates="team")
    transport = relationship("TransportAssignment", back_populates="team")


class Participant(TimestampMixin, Base):
    __tablename__ = "participants"
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    registration_no = Column(String(60), unique=True, index=True)
    full_name = Column(String(200), nullable=False)
    gender = Column(String(20))
    age = Column(Integer)
    role = Column(String(80))
    notes = Column(Text)

    team = relationship("Team", back_populates="participants")


class Coach(TimestampMixin, Base):
    __tablename__ = "coaches"
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    full_name = Column(String(200), nullable=False)
    email = Column(String(200))
    phone = Column(String(60))
    notes = Column(Text)

    team = relationship("Team", back_populates="coaches")


class Building(TimestampMixin, Base):
    __tablename__ = "buildings"
    id = Column(Integer, primary_key=True)
    name = Column(String(160), nullable=False)
    code = Column(String(40))
    description = Column(Text)

    floors = relationship(
        "Floor", back_populates="building", cascade="all, delete-orphan", order_by="Floor.level"
    )


class Floor(TimestampMixin, Base):
    __tablename__ = "floors"
    id = Column(Integer, primary_key=True)
    building_id = Column(Integer, ForeignKey("buildings.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(120), nullable=False)
    level = Column(Integer, default=0)
    notes = Column(Text)

    building = relationship("Building", back_populates="floors")
    rooms = relationship(
        "Room", back_populates="floor", cascade="all, delete-orphan", order_by="Room.name"
    )


class Room(TimestampMixin, Base):
    __tablename__ = "rooms"
    id = Column(Integer, primary_key=True)
    floor_id = Column(Integer, ForeignKey("floors.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(80), nullable=False)
    capacity = Column(Integer, default=0)
    room_type = Column(String(80))
    notes = Column(Text)

    floor = relationship("Floor", back_populates="rooms")
    assignments = relationship(
        "AccommodationAssignment", back_populates="room", cascade="all, delete-orphan"
    )
    beds = relationship("Bed", back_populates="room", cascade="all, delete-orphan", order_by="Bed.label")
    duty_assignments = relationship(
        "DutyAssignment", back_populates="room", cascade="all, delete-orphan"
    )


class Bed(TimestampMixin, Base):
    __tablename__ = "beds"
    id = Column(Integer, primary_key=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    label = Column(String(60), nullable=False)
    notes = Column(Text)

    room = relationship("Room", back_populates="beds")
    assignment = relationship("AccommodationAssignment", back_populates="bed", uselist=False)


class AccommodationAssignment(TimestampMixin, Base):
    __tablename__ = "accommodation_assignments"
    id = Column(Integer, primary_key=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"))
    participant_id = Column(Integer, ForeignKey("participants.id", ondelete="SET NULL"))
    bed_id = Column(Integer, ForeignKey("beds.id", ondelete="SET NULL"))
    checkin_date = Column(DateTime(timezone=True))
    checkout_date = Column(DateTime(timezone=True))
    notes = Column(Text)

    room = relationship("Room", back_populates="assignments")
    team = relationship("Team", back_populates="accommodation")
    bed = relationship("Bed", back_populates="assignment")


class Venue(TimestampMixin, Base):
    __tablename__ = "venues"
    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    venue_type = Column(String(80))
    capacity = Column(Integer)
    location = Column(String(300))
    description = Column(Text)


class ScheduleEvent(TimestampMixin, Base):
    __tablename__ = "schedule_events"
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    venue_id = Column(Integer, ForeignKey("venues.id", ondelete="SET NULL"))
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"))
    start_time = Column(DateTime(timezone=True))
    end_time = Column(DateTime(timezone=True))
    description = Column(Text)


class Announcement(TimestampMixin, Base):
    __tablename__ = "announcements"
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    priority = Column(String(20), default="normal")  # low | normal | high | urgent
    audience = Column(String(30), default="everyone")  # everyone|team|organizers|staff|coaches
    is_published = Column(Boolean, default=True)
    published_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True))


class Driver(TimestampMixin, Base):
    __tablename__ = "drivers"
    id = Column(Integer, primary_key=True)
    name = Column(String(160), nullable=False)
    phone = Column(String(60))
    license_no = Column(String(80))
    notes = Column(Text)


class TransportVehicle(TimestampMixin, Base):
    __tablename__ = "transport_vehicles"
    id = Column(Integer, primary_key=True)
    label = Column(String(80), nullable=False)  # e.g. "Bus B3"
    vehicle_type = Column(String(80))
    capacity = Column(Integer)
    driver_id = Column(Integer, ForeignKey("drivers.id", ondelete="SET NULL"))
    notes = Column(Text)

    driver = relationship("Driver")


class TransportAssignment(TimestampMixin, Base):
    __tablename__ = "transport_assignments"
    id = Column(Integer, primary_key=True)
    vehicle_id = Column(Integer, ForeignKey("transport_vehicles.id", ondelete="CASCADE"))
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"))
    pickup_location = Column(String(200))
    drop_location = Column(String(200))
    pickup_time = Column(DateTime(timezone=True))
    route = Column(String(300))
    notes = Column(Text)

    team = relationship("Team", back_populates="transport")
    vehicle = relationship("TransportVehicle")


class ProcurementItem(TimestampMixin, Base):
    __tablename__ = "procurement_items"
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    category = Column(String(60), default="General")
    status = Column(String(40), default="Open")  # Open|Researching|Quoted|Ordered|Received|Cancelled
    quantity = Column(Integer)
    target_unit_price = Column(Numeric(12, 2))
    max_budget = Column(Numeric(14, 2))
    currency = Column(String(8), default="INR")
    supplier = Column(String(200))
    owner = Column(String(160))
    notes = Column(Text)


class KnowledgeItem(TimestampMixin, Base):
    """The Cluster Knowledge Base entry — preserves the decision AND the WHY."""

    __tablename__ = "knowledge_items"
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    category = Column(String(60), default="General")
    status = Column(String(40), default="Idea")
    description = Column(Text)
    decision = Column(Text)
    reason = Column(Text)
    owner = Column(String(160))
    tags = Column(String(400))  # comma-separated; exposed as list in the API
    notes = Column(Text)

    tasks = relationship("Task", back_populates="knowledge_item")
    documents = relationship("Document", back_populates="knowledge_item")
    comments = relationship(
        "Comment", back_populates="knowledge_item", cascade="all, delete-orphan"
    )


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    status = Column(String(40), default="pending")  # pending|in_progress|completed
    priority = Column(String(20), default="normal")
    owner = Column(String(160))
    due_date = Column(DateTime(timezone=True))
    knowledge_item_id = Column(Integer, ForeignKey("knowledge_items.id", ondelete="SET NULL"))

    knowledge_item = relationship("KnowledgeItem", back_populates="tasks")


class Document(TimestampMixin, Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    category = Column(String(60))
    file_name = Column(String(300))
    file_url = Column(String(600))  # external link for non-uploaded documents
    storage_path = Column(String(600))  # local disk path for uploaded files
    content_type = Column(String(120))
    size_bytes = Column(Integer)
    is_upload = Column(Boolean, default=False)
    knowledge_item_id = Column(Integer, ForeignKey("knowledge_items.id", ondelete="SET NULL"))

    knowledge_item = relationship("KnowledgeItem", back_populates="documents")


class Comment(TimestampMixin, Base):
    __tablename__ = "comments"
    id = Column(Integer, primary_key=True)
    knowledge_item_id = Column(Integer, ForeignKey("knowledge_items.id", ondelete="CASCADE"), nullable=False)
    author = Column(String(160), default="Organizer")
    body = Column(Text, nullable=False)

    knowledge_item = relationship("KnowledgeItem", back_populates="comments")


class Contact(TimestampMixin, Base):
    __tablename__ = "contacts"
    id = Column(Integer, primary_key=True)
    name = Column(String(160), nullable=False)
    role = Column(String(120))
    phone = Column(String(60))
    email = Column(String(200))
    category = Column(String(60))
    notes = Column(Text)


class StaffMember(TimestampMixin, Base):
    __tablename__ = "staff_members"
    id = Column(Integer, primary_key=True)
    full_name = Column(String(160), nullable=False)
    phone = Column(String(60))
    email = Column(String(200))
    category = Column(String(80))  # one of schemas.STAFF_CATEGORIES — who they are, not what duty they're on
    notes = Column(Text)

    duties = relationship("DutyAssignment", back_populates="staff", cascade="all, delete-orphan")


class DutyAssignment(TimestampMixin, Base):
    __tablename__ = "duty_assignments"
    id = Column(Integer, primary_key=True)
    staff_id = Column(Integer, ForeignKey("staff_members.id", ondelete="CASCADE"), nullable=False)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False)
    duty_type = Column(String(80), nullable=False)  # free text; suggestions from DUTY_TYPES
    start_time = Column(DateTime(timezone=True))
    end_time = Column(DateTime(timezone=True))
    notes = Column(Text)

    staff = relationship("StaffMember", back_populates="duties")
    room = relationship("Room", back_populates="duty_assignments")
