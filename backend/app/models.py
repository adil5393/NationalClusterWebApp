"""SQLAlchemy ORM models: the normalized relational schema for Cluster Nationals.

This models the full domain so the schema is future-ready (Phase 2+), while only a
subset has full CRUD wired in Phase 1.
"""
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    LargeBinary,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
    text,
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
    # A school's own affiliation number (e.g. CBSE-issued) — distinct from
    # school_code, which this organizer assigns. Populated by the attendance
    # list import when the sheet has it; used by the registration-form
    # import as a fallback lookup when a row's "School Code" cell doesn't
    # match any school_code (see routers/imports.py).
    affiliation_number = Column(String(60), unique=True, index=True)
    name = Column(String(200), nullable=False)
    school = Column(String(200))
    region = Column(String(120))
    country = Column(String(120), default="India")
    contact_name = Column(String(160))
    contact_email = Column(String(200))
    contact_phone = Column(String(60))
    member_count = Column(Integer, default=0)
    notes = Column(Text)
    # Fooding/lodging arrangement from the registration form's "Stay" column
    # (free text — the form doesn't constrain it to fixed options). Organizer
    # Portal only: never exposed on any /api/public/* endpoint.
    stay = Column(String(120))
    # Manual organizer bench (e.g. a school withdrew) — enforced in
    # routers/matches.py _check_team_playable, alongside the automatic
    # attendance-based check (Tournament.min_present_players). Both keep the
    # team visible everywhere (never filtered out of a select list), just
    # blocked from being placed into a match/pool and visually flagged.
    is_active = Column(Boolean, nullable=False, default=True)
    # Whether the school's delegation has physically arrived at the venue —
    # purely informational (organizer confirmed: no effect on match/pool
    # eligibility), unlike is_active/TeamInactiveAgeGroup below.
    has_arrived = Column(Boolean, nullable=False, default=False)
    # Self-reported travel plan from the team arrival Google Form (see
    # routers/imports.py import_team_arrivals_from_sheet) — separate from the
    # organizer-confirmed has_arrived toggle above; this is what the school
    # told the organizer to expect, not a confirmation anyone has checked.
    arrival_date = Column(Date)
    arrival_time = Column(String(20))
    arrival_location = Column(String(200))
    arrival_reported_email = Column(String(200))
    # The form response's own Timestamp column — lets a resync keep only the
    # latest submission per school when someone corrects an earlier entry.
    arrival_reported_at = Column(DateTime)

    participants = relationship("Participant", back_populates="team", cascade="all, delete-orphan")
    coaches = relationship("Coach", back_populates="team", cascade="all, delete-orphan")
    photos = relationship("TeamPhoto", back_populates="team", cascade="all, delete-orphan", order_by="TeamPhoto.id")
    accommodation = relationship("AccommodationAssignment", back_populates="team")
    transport = relationship("TransportAssignment", back_populates="team")
    last_year_awards = relationship("TeamLastYearAward", back_populates="team", cascade="all, delete-orphan")
    inactive_age_groups = relationship("TeamInactiveAgeGroup", back_populates="team", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="team", cascade="all, delete-orphan", order_by="Payment.id")


class Payment(TimestampMixin, Base):
    """One transaction in a team's registration-fee ledger (routers/payments.py,
    printed via receipt.py). An append-only ledger — rows are never edited or
    deleted — so a team's financial history is always exactly the sum of its
    rows, and a re-printed document stays faithful to what actually happened
    even if attendance changes afterwards. Three kinds:

    - BILL: an invoice — declares what a set of members owe, but doesn't mean
      money has changed hands yet (no payment_mode/transaction_id). `members`
      snapshots exactly who it charged for ({"kind": "participant"|"coach",
      "id", "name", "role"} per member), so a later bill's UI can compute
      "who's present but not yet billed" by diffing against every prior
      BILL's members for that team. `subtotal` (per-member amount x count)
      and `discount` are kept alongside the final `amount` (subtotal minus
      discount plus security_fee) so a re-printed invoice shows the same
      breakdown later. `security_fee` is a flat, one-time-per-team charge
      (default receipt.SECURITY_FEE_DEFAULT, editable) — only ever non-zero
      on a team's first bill; see routers/payments.py create_bill.
    - PAYMENT: money actually received against the team's outstanding
      balance (total BILL amount minus total PAYMENT amount so far) — free-form,
      capped at that balance, supports partial payments over multiple rows.
    - REFUND: money returned, free-form, capped at the team's net-received
      total (total PAYMENT minus total REFUND so far).

    BILL/PAYMENT/REFUND each populate a different subset of the optional
    columns below (members+subtotal+discount / payment_mode+transaction_id /
    payment_mode+transaction_id+reason respectively) — see routers/payments.py
    for the exact validation per kind."""
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String(10), nullable=False)  # "BILL" | "PAYMENT" | "REFUND"
    amount = Column(Integer, nullable=False)  # Rs., always positive regardless of kind
    payment_mode = Column(String(10))  # "Cash" | "UPI" — PAYMENT/REFUND only, null for BILL
    transaction_id = Column(String(100))  # UPI reference; null for Cash or for a BILL
    payment_date = Column(Date, nullable=False)
    reason = Column(Text)  # REFUND only
    members = Column(JSON)  # BILL only
    subtotal = Column(Integer)  # BILL only: per_member_amount x member count, before discount
    discount = Column(Integer)  # BILL only: flat Rs. knocked off subtotal to get `amount`
    security_fee = Column(Integer)  # BILL only: flat one-time team security fee, added to (subtotal - discount)

    team = relationship("Team", back_populates="payments")


class TeamPhoto(TimestampMixin, Base):
    """One of possibly several photos for a team — the school registration
    form's photo column can list more than one Drive link, comma-separated
    (same convention as its coach-name column), and the public team page
    rotates through all of them rather than showing just one. Stored raw as
    entered; routers/public.py converts each to a hotlinkable thumbnail URL
    on the way out."""
    __tablename__ = "team_photos"
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    url = Column(String(600), nullable=False)

    team = relationship("Team", back_populates="photos")


class TeamLastYearAward(Base):
    """A team's last-year result, scoped to one age group — a school can have
    finished top-4 in one age group and not another, so this isn't a single
    tournament-wide flag. Four possible finishes: "winner" | "runner" |
    "third" | "fourth" — last year's top 4 in a given age group, each
    tracked separately per age group. Enforced in routers/teams.py: at most
    one team per (age_group, award) — the DB-level unique constraint backs
    that up — and a team holds at most one of the four in the same age group
    (unique on team_id + age_group). Any two of last year's top-4 finishers
    in the same age group are also never allowed to share a pool this year
    (routers/pools.py _check_last_year_conflict) — not just winner-vs-runner,
    all six pairs among the four are mutually exclusive."""
    __tablename__ = "team_last_year_awards"
    __table_args__ = (
        UniqueConstraint("team_id", "age_group", name="uq_team_last_year_award_team_group"),
        UniqueConstraint("age_group", "award", name="uq_team_last_year_award_group_award"),
    )
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    age_group = Column(String(40), nullable=False)
    award = Column(String(10), nullable=False)  # "winner" | "runner" | "third" | "fourth"

    team = relationship("Team", back_populates="last_year_awards")


class TeamInactiveAgeGroup(Base):
    """Per-age-group companion to Team.is_active — that column still benches a
    school across every age group at once (a deliberate "deactivate
    everywhere" convenience); this table lets an organizer deactivate just
    one of a school's squads (e.g. its Under 14 team withdrew) without
    touching its Under 17 eligibility. Row existence = inactive for that age
    group; no row = active — an opt-out model, same shape as
    TeamLastYearAward, so no backfill is needed for every existing
    team x age_group pair. Enforced in routers/matches.py
    _team_unplayable_reason, alongside Team.is_active."""
    __tablename__ = "team_inactive_age_groups"
    __table_args__ = (UniqueConstraint("team_id", "age_group", name="uq_team_inactive_age_group"),)
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    age_group = Column(String(40), nullable=False)

    team = relationship("Team", back_populates="inactive_age_groups")


class TeamDisqualification(TimestampMixin, Base):
    """A team disqualified from one specific Tournament — never event-wide,
    since a school can be legitimately still playing a different age group's
    tournament. Row existence = disqualified from that tournament; checked
    in routers/matches.py's _team_unplayable_reason (alongside Team.is_active
    and TeamInactiveAgeGroup) so a disqualified team can never be newly
    scheduled into anything else in this tournament.

    The cascade this actually implies — forfeiting every already-scheduled
    match where the disqualified team has a seated opponent, cancelling the
    rest — happens once, at disqualification time (see
    routers/matches.py's disqualify_team); this row only keeps the team out
    of anything scheduled AFTER that moment. `match_id` is which match the
    disqualification happened during, if any (nullable: a future UI path
    might disqualify from a team/tournament page with no specific match in
    play)."""
    __tablename__ = "team_disqualifications"
    __table_args__ = (UniqueConstraint("team_id", "tournament_id", name="uq_team_disqualification"),)
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    tournament_id = Column(Integer, ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False)
    match_id = Column(Integer, ForeignKey("matches.id", ondelete="SET NULL"))
    reason = Column(Text, nullable=False)
    disqualified_by_id = Column(Integer, ForeignKey("organizer_users.id", ondelete="SET NULL"))

    team = relationship("Team")
    tournament = relationship("Tournament")


class Participant(TimestampMixin, Base):
    __tablename__ = "participants"
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    registration_no = Column(String(60), unique=True, index=True)
    full_name = Column(String(200), nullable=False)
    gender = Column(String(20))
    age = Column(Integer)
    age_group = Column(String(40))
    role = Column(String(80))
    notes = Column(Text)
    # Attendance/check-in at the event — separate from registration itself.
    # Matches are only scheduled to reflect players actually here, so this is
    # what the Matches builder's "present" counts read from. Toggled only
    # via POST .../attendance (routers/attendance.py) — never the generic
    # participant edit endpoint.
    is_present = Column(Boolean, nullable=False, default=False)
    checked_in_at = Column(DateTime(timezone=True))
    # Weigh-in reading (kg) against the AKFI weight-category caps
    # (routers/attendance.py AGE_GROUP_WEIGHT_CAPS), settable only via
    # POST .../weight. Independent of is_present/attendance/billing — an
    # overweight participant still counts as present and still gets billed;
    # weight only excludes them from a team's present-player headcount for
    # match/pool/fixture eligibility (see routers/matches.py
    # _team_unplayable_reason / is_overweight).
    weight = Column(Numeric(5, 2))
    # Set via the public /public/participants/{id}/photo upload (gated by
    # registration_no, see public.py) — a coach/manager uploads this for
    # their own roster, no admin action needed.
    photo_filename = Column(String(120))
    # True only once a photo has gone through the manual crop-confirm step
    # (see face_crop.py / TeamPortal.tsx's cropper) — lets the roster tell a
    # deliberately-framed photo apart from a legacy one uploaded before that
    # step existed (those default to False and were never re-confirmed), so
    # a coach/admin can see which photos are done and don't need revisiting.
    photo_finalized = Column(Boolean, nullable=False, default=False, server_default="false")
    # ID-card fields — populated by the attendance-list import (see
    # imports.py's fathername/dob/Class columns) or editable by an admin.
    father_name = Column(String(200))
    date_of_birth = Column(Date)
    student_class = Column(String(40))

    team = relationship("Team", back_populates="participants")

    @property
    def photo_url(self) -> "str | None":
        return f"/api/assets/participants/{self.photo_filename}" if self.photo_filename else None


class Coach(TimestampMixin, Base):
    __tablename__ = "coaches"
    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    full_name = Column(String(200), nullable=False)
    role = Column(String(20), nullable=False, default="Coach")  # "Coach" | "Manager"
    email = Column(String(200))
    phone = Column(String(60))
    notes = Column(Text)
    # ID-card fields — see id_card.py's render_staff_id_card. aadhaar_no is
    # free-text (not validated/unique) since it's only ever printed on the
    # physical card, never used to look anyone up.
    aadhaar_no = Column(String(20))
    # Set via the public /public/coaches/{id}/photo upload (gated by phone
    # number, same shape as Participant.photo_filename's DOB-gated upload —
    # see public.py) or an admin removing it from the Participants admin page.
    photo_filename = Column(String(120))
    # Attendance/check-in at the event, same convention as Participant — kept
    # off any fixture/eligibility query on purpose, so coaches/managers never
    # count toward age-group eligibility or present-count thresholds.
    is_present = Column(Boolean, nullable=False, default=False)
    checked_in_at = Column(DateTime(timezone=True))

    team = relationship("Team", back_populates="coaches")

    @property
    def photo_url(self) -> "str | None":
        return f"/api/assets/coaches/{self.photo_filename}" if self.photo_filename else None


class Volunteer(TimestampMixin, Base):
    """The host school's own event volunteers — a flat roster independent of
    any participating Team (unlike Participant/Coach, which always belong to
    one). Gets its own simpler ID card (see id_card.py's
    render_volunteer_id_card) showing only name + class, matching
    backend/assets/templates/volunteer_id_card_template.png."""
    __tablename__ = "volunteers"
    id = Column(Integer, primary_key=True)
    full_name = Column(String(200), nullable=False)
    student_class = Column(String(40))
    gender = Column(String(20))
    phone = Column(String(60))
    email = Column(String(200))
    notes = Column(Text)
    photo_filename = Column(String(120))

    @property
    def photo_url(self) -> "str | None":
        return f"/api/assets/volunteers/{self.photo_filename}" if self.photo_filename else None

    @property
    def login_username(self) -> "str | None":
        """None until an organizer creates one on demand (see routers/volunteers.py
        POST /volunteers/{id}/credential) — `organizer_users` is the backref
        from OrganizerUser.volunteers, mirroring StaffMember.login_username."""
        return self.organizer_users[0].username if self.organizer_users else None


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
    capacity = Column(Integer, default=18)  # organizer's standard bed count per room; editable per-room for exceptions
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


class AccommodationRule(TimestampMixin, Base):
    """A hostel rule/policy line item (e.g. "Curfew" / "All participants must
    report by 21:30 hrs") shown on the public /accommodation page's rules
    list — organizer-managed instead of hardcoded, same pattern as Faq."""
    __tablename__ = "accommodation_rules"
    id = Column(Integer, primary_key=True)
    title = Column(String(120), nullable=False)
    description = Column(Text, nullable=False)
    sequence = Column(Integer, nullable=False, default=0)
    is_published = Column(Boolean, default=True)


class Venue(TimestampMixin, Base):
    __tablename__ = "venues"
    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    venue_type = Column(String(80))
    capacity = Column(Integer)
    location = Column(String(300))
    description = Column(Text)


class Mat(Base):
    """A named mat/ground ("Mat 1", "Ground A") an organizer registers once
    from the Mat / Ground admin page, then assigns matches to via a dropdown
    (Match.mat_id) — deliberately separate from Venue, which models the
    whole-event location (campus, dining hall) rather than which of several
    parallel playing surfaces a specific match is on right now."""
    __tablename__ = "mats"
    __table_args__ = (UniqueConstraint("name", name="uq_mats_name"),)
    id = Column(Integer, primary_key=True)
    name = Column(String(60), nullable=False)


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


class Faq(TimestampMixin, Base):
    """Public-facing Frequently Asked Questions, organizer-managed from the
    FAQ admin page and shown on the public /faq page. sequence controls
    display order (ascending); is_published lets an organizer draft one
    without it going live yet."""
    __tablename__ = "faqs"
    id = Column(Integer, primary_key=True)
    question = Column(String(300), nullable=False)
    answer = Column(Text, nullable=False)
    category = Column(String(60), default="General")
    sequence = Column(Integer, nullable=False, default=0)
    is_published = Column(Boolean, default=True)


class FaqQuestion(TimestampMixin, Base):
    """A visitor-submitted question from the public FAQ page's "Ask a
    question" form — an inbox organizers review from the FAQ admin page.
    Answering it there either promotes it into a published Faq (question +
    the organizer's answer become a real entry) or dismisses it."""
    __tablename__ = "faq_questions"
    id = Column(Integer, primary_key=True)
    name = Column(String(120))
    email = Column(String(200))
    question = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="new")  # new | promoted | dismissed
    promoted_faq_id = Column(Integer, ForeignKey("faqs.id", ondelete="SET NULL"))


class GalleryPhoto(TimestampMixin, Base):
    """A Championship Photo Gallery upload (bulk from the admin panel, or
    camera capture from the mobile app — see routers/gallery.py), tagged by
    day/group so the public homepage's album can group photos together. The
    actual image bytes live on disk at backend/assets/about/<filename> — this
    row is just the metadata layer on top of what public.py's
    public_about_images already scans directly from that folder."""
    __tablename__ = "gallery_photos"
    id = Column(Integer, primary_key=True)
    filename = Column(String(255), nullable=False, unique=True)
    tag = Column(String(60), nullable=False, default="General")

    @property
    def url(self) -> str:
        return f"/api/assets/about/{self.filename}"


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
    """The organizer-wide task board (routers/tasks.py) — organizer/operator
    accounts see and manage the whole board; category is the free-text "list"
    it sits in. assigned_staff_id is optional: an unassigned task is just a
    general team to-do, an assigned one additionally shows up as "yours" to
    that staff member via routers/me.py's self-service endpoints (a
    self-service staff account has no access to routers/tasks.py itself) —
    distinct from DutyAssignment, which is the room/shift roster, not a
    to-do."""
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    status = Column(String(40), default="pending")  # pending|in_progress|completed
    priority = Column(String(20), default="normal")
    owner = Column(String(160))
    category = Column(String(80), nullable=False, default="General")
    assigned_staff_id = Column(Integer, ForeignKey("staff_members.id", ondelete="SET NULL"))
    shift_id = Column(Integer, ForeignKey("staff_shifts.id", ondelete="SET NULL"), nullable=True, index=True)
    due_date = Column(DateTime(timezone=True))
    knowledge_item_id = Column(Integer, ForeignKey("knowledge_items.id", ondelete="SET NULL"))

    knowledge_item = relationship("KnowledgeItem", back_populates="tasks")
    assigned_staff = relationship("StaffMember")
    shift = relationship("StaffShift", back_populates="tasks")


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
    shifts = relationship("StaffShift", back_populates="staff", cascade="all, delete-orphan", order_by="StaffShift.id")

    @property
    def login_username(self) -> "str | None":
        """None until an organizer creates one on demand (see routers/staff.py
        POST /staff/{id}/credential) — `organizer_users` is the backref from
        OrganizerUser.staff_members."""
        return self.organizer_users[0].username if self.organizer_users else None


class ShiftBlock(TimestampMixin, Base):
    """WHEN a workforce shift exists for tournament operations."""
    __tablename__ = "shift_blocks"
    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)  # e.g. "Morning Shift", "Ground 2 Night Shift"
    start_time = Column(DateTime(timezone=True), nullable=False, index=True)
    end_time = Column(DateTime(timezone=True), nullable=False, index=True)
    status = Column(String(40), nullable=False, default="SCHEDULED")  # SCHEDULED | CANCELLED
    notes = Column(Text)

    staff_assignments = relationship("StaffShift", back_populates="shift_block", cascade="all, delete-orphan")
    incharges = relationship("ShiftOperationalIncharge", back_populates="shift_block", cascade="all, delete-orphan")

    @property
    def is_active(self) -> bool:
        if self.status == "CANCELLED":
            return False
        now = datetime.now(timezone.utc)
        st = self.start_time if self.start_time.tzinfo else self.start_time.replace(tzinfo=timezone.utc)
        et = self.end_time if self.end_time.tzinfo else self.end_time.replace(tzinfo=timezone.utc)
        return st <= now < et

    @property
    def derived_status(self) -> str:
        if self.status == "CANCELLED":
            return "CANCELLED"
        now = datetime.now(timezone.utc)
        st = self.start_time if self.start_time.tzinfo else self.start_time.replace(tzinfo=timezone.utc)
        et = self.end_time if self.end_time.tzinfo else self.end_time.replace(tzinfo=timezone.utc)
        if now < st:
            return "UPCOMING"
        if st <= now < et:
            return "ON_SHIFT"
        return "COMPLETED"


class StaffShift(TimestampMixin, Base):
    """WHO is assigned to a ShiftBlock. A StaffMember's membership in a ShiftBlock."""
    __tablename__ = "staff_shifts"
    id = Column(Integer, primary_key=True)
    shift_block_id = Column(Integer, ForeignKey("shift_blocks.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_id = Column(Integer, ForeignKey("staff_members.id", ondelete="CASCADE"), nullable=False, index=True)
    notes = Column(Text)

    __table_args__ = (
        UniqueConstraint("shift_block_id", "staff_id", name="uq_shift_block_staff"),
    )

    shift_block = relationship("ShiftBlock", back_populates="staff_assignments")
    staff = relationship("StaffMember", back_populates="shifts")
    duties = relationship("DutyAssignment", back_populates="shift")
    tasks = relationship("Task", back_populates="shift")

    @property
    def is_active(self) -> bool:
        return self.shift_block.is_active if self.shift_block else False

    @property
    def derived_status(self) -> str:
        return self.shift_block.derived_status if self.shift_block else "SCHEDULED"

    @property
    def start_time(self):
        return self.shift_block.start_time if self.shift_block else None

    @property
    def end_time(self):
        return self.shift_block.end_time if self.shift_block else None

    @property
    def shift_name(self):
        return self.shift_block.name if self.shift_block else None


class EventLocation(TimestampMixin, Base):
    """A named operational venue/place at the tournament (e.g., 'Ground 1',
    'Main Gate', 'Dining Hall', 'Reception', 'Boys Hostel'). Used to assign
    operational duties and track workforce deployment across tournament sites.

    Two kinds of row:
    - STANDALONE: a genuine ad-hoc operational station with no equivalent
      elsewhere (Main Gate, Medical Desk, Match Control Desk) — mat_id/
      building_id/room_id all NULL, name/location_type are this row's own.
    - LINKED: a thin wrapper around an existing authoritative physical
      record (Mat, Building, or Room) so Staff Duties can reference it
      without duplicating it — see routers/event_locations.py
      resolve_location_display()/resolve_event_location_for_source(), which
      is how these get created (never by an organizer manually) and how
      their live display name/type are derived from the linked source
      rather than trusted from this row's own (possibly stale) columns.
      Exactly one of mat_id/building_id/room_id may be set, never more than
      one (ck_event_location_single_source below), and each can back at
      most one EventLocation row (the three partial unique indexes) so a
      given Mat/Building/Room is never wrapped twice.
    """
    __tablename__ = "event_locations"
    __table_args__ = (
        UniqueConstraint("name", name="uq_event_locations_name"),
        CheckConstraint(
            "(CASE WHEN mat_id IS NOT NULL THEN 1 ELSE 0 END) "
            "+ (CASE WHEN building_id IS NOT NULL THEN 1 ELSE 0 END) "
            "+ (CASE WHEN room_id IS NOT NULL THEN 1 ELSE 0 END) <= 1",
            name="ck_event_location_single_source",
        ),
        Index("uq_event_locations_mat_id", "mat_id", unique=True, postgresql_where=text("mat_id IS NOT NULL")),
        Index(
            "uq_event_locations_building_id", "building_id", unique=True,
            postgresql_where=text("building_id IS NOT NULL"),
        ),
        Index("uq_event_locations_room_id", "room_id", unique=True, postgresql_where=text("room_id IS NOT NULL")),
    )

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False)
    location_type = Column(String(40), nullable=False, default="OTHER")
    description = Column(Text)
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    # Physical-source link (LINKED rows only) — RESTRICT, not SET NULL/CASCADE:
    # the source's own delete endpoint (mats.py/structure.py) already checks
    # for and blocks deletion while a link exists, so this is a defense-in-depth
    # backstop, not the primary guard. See class docstring above.
    mat_id = Column(Integer, ForeignKey("mats.id", ondelete="RESTRICT"), nullable=True, index=True)
    building_id = Column(Integer, ForeignKey("buildings.id", ondelete="RESTRICT"), nullable=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="RESTRICT"), nullable=True, index=True)

    duties = relationship("DutyAssignment", back_populates="location")
    mat = relationship("Mat")
    building = relationship("Building")
    room = relationship("Room")


class OperationalArea(TimestampMixin, Base):
    """A stable reporting/team classification for duties — e.g. "Ground /
    Match Operations", "Food" — answering WHO A DUTY REPORTS UNDER, distinct
    from DutyAssignment.duty_type (WHAT specific task, e.g. "Match Control"
    or "Court Support"), StaffMember.category (WHO the person broadly is),
    and EventLocation (WHERE). Several duty_types can share one area (e.g.
    "Match Control" and "Ground Coordination" both under GROUND_MATCH);
    duty_type itself was found unsafe as this key during the Staff
    Operations in-charge audit — it's free text with documented legacy
    aliases (Food/Fooding, Accommodation/Lodging, ...) and no server-side
    validation, so several strings can mean the same real responsibility
    while looking unrelated to a naive string-based grouping.

    Deliberately a small flat lookup (like EventLocation/WalkieChannel) —
    no hierarchy, no scheduling behavior. See ShiftOperationalIncharge for
    the shift-wise "who leads this area" relationship built on top of it."""
    __tablename__ = "operational_areas"
    __table_args__ = (
        UniqueConstraint("code", name="uq_operational_areas_code"),
        UniqueConstraint("name", name="uq_operational_areas_name"),
    )

    id = Column(Integer, primary_key=True)
    code = Column(String(40), nullable=False)  # stable machine key, e.g. "GROUND_MATCH"
    name = Column(String(120), nullable=False)  # display label, e.g. "Ground / Match Operations"
    description = Column(Text)
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)

    duties = relationship("DutyAssignment", back_populates="operational_area")
    incharges = relationship("ShiftOperationalIncharge", back_populates="operational_area", cascade="all, delete-orphan")


class DutyAssignment(TimestampMixin, Base):
    __tablename__ = "duty_assignments"
    id = Column(Integer, primary_key=True)
    staff_id = Column(Integer, ForeignKey("staff_members.id", ondelete="CASCADE"), nullable=False)
    shift_id = Column(Integer, ForeignKey("staff_shifts.id", ondelete="SET NULL"), nullable=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=True)
    location_id = Column(Integer, ForeignKey("event_locations.id", ondelete="SET NULL"), nullable=True, index=True)
    duty_type = Column(String(80), nullable=False)  # free text; suggestions from DUTY_TYPES
    # Nullable for backward compatibility: every duty that existed before this
    # column was added keeps working unmodified, at NULL ("unclassified")
    # until an organizer re-saves it or the migration's deterministic
    # duty_type backfill matched it. New duties are expected (API-validated,
    # not DB-enforced) to always set this — see routers/staff.py create_duty.
    operational_area_id = Column(Integer, ForeignKey("operational_areas.id", ondelete="SET NULL"), nullable=True, index=True)
    start_time = Column(DateTime(timezone=True))
    end_time = Column(DateTime(timezone=True))
    notes = Column(Text)

    staff = relationship("StaffMember", back_populates="duties")
    shift = relationship("StaffShift", back_populates="duties")
    room = relationship("Room", back_populates="duty_assignments")
    location = relationship("EventLocation", back_populates="duties")
    operational_area = relationship("OperationalArea", back_populates="duties")


class ShiftOperationalIncharge(TimestampMixin, Base):
    """WHO leads a given OperationalArea for one specific ShiftBlock — e.g.
    "Rahul and Sameer are in-charge of Ground / Match Operations for the
    Morning Shift." One area can have several in-charges; one StaffMember
    can be in-charge of several areas, and across many ShiftBlocks, just by
    having a row per (shift_block, area) pair — no separate "for the whole
    event" concept is needed.

    IMPORTANT: keyed to shift_block_id (WHEN), never to StaffShift.id.
    DutyAssignment.shift_id points at a StaffShift row (WHO is on that
    block), a different id space — resolving "who is this duty's in-charge"
    always requires DutyAssignment.shift_id -> StaffShift.shift_block_id ->
    this table's shift_block_id, never a direct id comparison.

    V1 is intentionally just a reporting-visibility relationship: being
    listed here is not a StaffMember.category and grants no extra
    OrganizerUser permissions (see security.py) — an in-charge only gets
    read-only team visibility (routers/me.py), nothing else."""
    __tablename__ = "shift_operational_incharges"
    __table_args__ = (
        UniqueConstraint("shift_block_id", "operational_area_id", "staff_id", name="uq_shift_area_incharge"),
    )

    id = Column(Integer, primary_key=True)
    shift_block_id = Column(Integer, ForeignKey("shift_blocks.id", ondelete="CASCADE"), nullable=False, index=True)
    operational_area_id = Column(Integer, ForeignKey("operational_areas.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_id = Column(Integer, ForeignKey("staff_members.id", ondelete="CASCADE"), nullable=False, index=True)

    shift_block = relationship("ShiftBlock", back_populates="incharges")
    operational_area = relationship("OperationalArea", back_populates="incharges")
    staff = relationship("StaffMember")


class StaffLocation(TimestampMixin, Base):
    """One row per OrganizerUser — their last reported approximate location
    (organizer-only Staff Live Map), overwritten on every update. No history
    is kept by design; `updated_at` (from TimestampMixin) IS the "last seen"
    timestamp the map's freshness labels key off, so no separate
    last-reported column is needed.

    A one-to-one table here (user_id as the primary key, not a separate
    autoincrement id) rather than columns on OrganizerUser: this is an
    operational/ephemeral concern updated every few minutes by a background
    ping, not an identity/auth attribute — keeping it off the core login
    table means a location-reporting bug can never touch auth data, a user
    with no location yet is simply absent (no row) rather than a set of
    nullable columns on every login, and it leaves room to grow (e.g. a
    future event-zone FK) without cluttering OrganizerUser.
    """
    __tablename__ = "staff_locations"
    user_id = Column(Integer, ForeignKey("organizer_users.id", ondelete="CASCADE"), primary_key=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    accuracy = Column(Float)  # device-reported horizontal accuracy in meters, if known

    user = relationship("OrganizerUser", back_populates="location")


organizer_user_staff = Table(
    "organizer_user_staff",
    Base.metadata,
    Column("organizer_user_id", Integer, ForeignKey("organizer_users.id", ondelete="CASCADE"), primary_key=True),
    Column("staff_member_id", Integer, ForeignKey("staff_members.id", ondelete="CASCADE"), primary_key=True),
)


organizer_user_volunteer = Table(
    "organizer_user_volunteer",
    Base.metadata,
    Column("organizer_user_id", Integer, ForeignKey("organizer_users.id", ondelete="CASCADE"), primary_key=True),
    Column("volunteer_id", Integer, ForeignKey("volunteers.id", ondelete="CASCADE"), primary_key=True),
)


class OrganizerUser(TimestampMixin, Base):
    """An individual Organizer Portal login — replaced the old single shared
    ADMIN_PASSWORD. Deactivating (rather than deleting) revokes access while
    keeping the account's name on any audit trail."""
    __tablename__ = "organizer_users"
    id = Column(Integer, primary_key=True)
    username = Column(String(80), nullable=False, unique=True)
    full_name = Column(String(120))
    password_hash = Column(String(200), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    # Admins bypass `permissions` entirely (full access to every module, incl. Accounts).
    is_admin = Column(Boolean, nullable=False, default=False)
    # {module_key: "view" | "edit"} — a key missing/absent means no access to that
    # module at all. See schemas.ORGANIZER_MODULES for the fixed list of keys.
    permissions = Column(JSON, nullable=False, default=dict)

    # Which real staff member(s) this login belongs to — every account here is
    # meant for actual event staff, and one account (e.g. a shared shift
    # tablet) can stand in for more than one person.
    staff_members = relationship("StaffMember", secondary=organizer_user_staff, backref="organizer_users")
    # Which volunteer(s) this login belongs to — mirrors staff_members above,
    # but for the volunteer self-service login (see routers/volunteers.py
    # create_volunteer_credential, routers/me.py's /me/volunteer endpoints).
    volunteers = relationship("Volunteer", secondary=organizer_user_volunteer, backref="organizer_users")
    # Matches this account is assigned to referee/manage — an independent access
    # path from `permissions`: an assigned account can view every match and fully
    # control (except delete/reset — see security.require_match_access) its own
    # assigned matches, even with no "matches" entry in `permissions` at all.
    assigned_matches = relationship("Match", secondary="match_staff_assignments", back_populates="assigned_users")
    # Last known approximate location (Staff Live Map) — one-to-one, no
    # history. See StaffLocation below for why this is its own table rather
    # than columns on this one.
    location = relationship("StaffLocation", back_populates="user", uselist=False, cascade="all, delete-orphan")


class WalkieChannel(TimestampMixin, Base):
    """A Walkie-Talkie PTT channel. `kind` distinguishes the 7 fixed
    operational channels seeded by this table's own migration ("SYSTEM") from
    any later category-derived channel ("GROUP", access derived live from
    StaffMember.category — see routers/walkie.py — never a stored membership
    list) and admin-created ad-hoc ones ("CUSTOM"). None of the seeded SYSTEM
    channels sets staff_category: only "Transport" the channel has any
    natural relationship to an existing StaffMember category, and even that
    is deliberately NOT wired up for V1 (see routers/walkie.py's access
    rules) — every SYSTEM channel is listen+transmit open to any
    authenticated organizer account except "All Staff", whose transmission
    is gated by `transmit_restricted` instead.

    No membership/roster table exists here on purpose: channel access is
    always computed live (admin bypass, transmit_restricted + explicit
    grants, or later a category match) rather than duplicated into a
    separately-maintained list that could drift from the real staff data."""
    __tablename__ = "walkie_channels"
    id = Column(Integer, primary_key=True)
    key = Column(String(40), nullable=False, unique=True)
    name = Column(String(120), nullable=False)
    icon = Column(String(8))  # a single emoji, e.g. "🚌"
    kind = Column(String(10), nullable=False, default="SYSTEM")  # "SYSTEM" | "GROUP" | "CUSTOM"
    # Set only for a future "GROUP" channel — which StaffMember.category value
    # grants access. Null for every channel seeded today.
    staff_category = Column(String(80))
    # True only for "All Staff": everyone may listen, but transmitting needs
    # is_admin or a WalkieChannelTransmitPermission row (see below) — every
    # other channel has no such restriction in V1.
    transmit_restricted = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)

    transmit_permissions = relationship(
        "WalkieChannelTransmitPermission", back_populates="channel", cascade="all, delete-orphan"
    )


class WalkieChannelTransmitPermission(Base):
    """An explicit grant to transmit on a `transmit_restricted` channel
    (currently just "All Staff") for an account that isn't already an admin.
    The one deliberate exception to "derive access, don't store membership"
    — this specific permission has no existing relationship to derive it
    from, so it has to be its own minimal table."""
    __tablename__ = "walkie_channel_transmit_permissions"
    id = Column(Integer, primary_key=True)
    channel_id = Column(Integer, ForeignKey("walkie_channels.id", ondelete="CASCADE"), nullable=False)
    organizer_user_id = Column(Integer, ForeignKey("organizer_users.id", ondelete="CASCADE"), nullable=False)
    __table_args__ = (UniqueConstraint("channel_id", "organizer_user_id", name="uq_walkie_transmit_permission"),)

    channel = relationship("WalkieChannel", back_populates="transmit_permissions")
    organizer_user = relationship("OrganizerUser")


class Tournament(TimestampMixin, Base):
    """One sport's knockout competition (e.g. "Kabaddi — Boys Under 17"). A
    Team (school) can appear in several Tournaments; Participants aren't
    modeled per-tournament yet — Match is between Teams, not individuals."""
    __tablename__ = "tournaments"
    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    sport = Column(String(80))
    # Free text, matching Participant.age_group (e.g. "Under 14") — not a fixed
    # enum, since the age groups in use come from whatever the attendance list
    # imported. Null means the tournament isn't scoped to one age group.
    age_group = Column(String(40))
    status = Column(String(20), nullable=False, default="draft")  # schemas.TOURNAMENT_STATUSES
    notes = Column(Text)
    # Minimum checked-in (Participant.is_present) players, in this tournament's
    # age group, a team needs before it's eligible to be placed into a match or
    # pool (routers/matches.py _check_team_playable) — 0 disables the check.
    min_present_players = Column(Integer, nullable=False, default=10)
    # How many teams qualify out of EACH pool in a League round, tournament-
    # wide (1 = winner only, 2 = winner + runner-up). Drives both how many
    # qualifiers _compute_advancing_teams pulls per pool and the pool-mirror
    # seeding routers/buckets.py _seed_league_pool_pairs uses when building
    # the next Knockout round from them.
    league_advance_count = Column(Integer, nullable=False, default=2)
    # How this tournament's bracket was produced by generate_bracket:
    # "AUTO" (whole_season=True — every round pre-wired, advances on its own,
    # no Bucket needed) or "MANUAL" (whole_season=False — each later round is
    # built one at a time via routers/buckets.py). NULL for a tournament that
    # never used Generate Bracket (built the old way, plain POST /rounds) —
    # treated like MANUAL everywhere this is checked.
    bracket_mode = Column(String(10))

    rounds = relationship(
        "Round", back_populates="tournament", cascade="all, delete-orphan", order_by="Round.sequence"
    )


class Round(TimestampMixin, Base):
    """A stage within a Tournament (e.g. "Round 1", "Quarter Final"). Tournaments
    don't all have the same rounds, so this is freeform, ordered by `sequence`.

    format/source_round_id/entrants exist to support the round-by-round
    advance flow (routers/buckets.py): once a round finishes, its advancing
    teams get pulled into a Bucket, which is later turned into a new round of
    whichever format the organizer picks (create-round stamps the new
    round's source_round_id back to the bucket's source round). Rounds
    created the old way (plain POST /rounds, or generate_bracket's one-shot
    full tree) leave format/source_round_id NULL and have no entrants row —
    _eligible_teams falls back to the tournament-wide list for those."""
    __tablename__ = "rounds"
    id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(120), nullable=False)
    sequence = Column(Integer, nullable=False, default=0)  # display/bracket order, earliest first
    format = Column(String(20))  # schemas.ROUND_FORMATS, or NULL for a round created the old way
    source_round_id = Column(Integer, ForeignKey("rounds.id", ondelete="SET NULL"))

    tournament = relationship("Tournament", back_populates="rounds")
    matches = relationship(
        "Match", back_populates="round", cascade="all, delete-orphan",
        order_by="Match.id", foreign_keys="Match.round_id",
    )
    pools = relationship("Pool", back_populates="round", cascade="all, delete-orphan", order_by="Pool.name")
    entrants = relationship("Team", secondary="round_entrants")


round_entrants = Table(
    "round_entrants",
    Base.metadata,
    Column("round_id", Integer, ForeignKey("rounds.id", ondelete="CASCADE"), primary_key=True),
    Column("team_id", Integer, ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True),
)


class Bucket(TimestampMixin, Base):
    """A staging area between a finished round and its successor (routers/
    buckets.py). Teams get pulled in — from a league round, pool by pool as
    each finishes; from a knockout round, its match winners — and stay in the
    bucket for the whole life of its source round: the organizer can turn
    just the currently-pulled entries into a round (create-round) as soon as
    they're ready, then keep pulling more in later and do it again — e.g.
    pool A/B's winners start playing while pool C/D are still finishing.
    Each entry tracks its own pulled/pushed state (BucketTeam.pushed_round_id)
    rather than the whole bucket closing after one round is built. Unique on
    source_round_id — exactly one bucket per source round, ever — so a race
    between two get_or_create_bucket calls (e.g. React StrictMode's double
    effect-fire) can't leave a stray duplicate that a later request might
    resolve to instead of the one with real pull/push history."""
    __tablename__ = "buckets"
    __table_args__ = (UniqueConstraint("source_round_id", name="uq_buckets_source_round_id"),)
    id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(120), nullable=False)
    # CASCADE (not SET NULL) — this column is NOT NULL, so if its source round
    # is ever deleted the bucket goes with it rather than violating that.
    source_round_id = Column(Integer, ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False)

    tournament = relationship("Tournament")
    source_round = relationship("Round", foreign_keys=[source_round_id])
    entries = relationship("BucketTeam", cascade="all, delete-orphan")


class BucketTeam(Base):
    """One team pulled into a Bucket. source_pool_id/seed_rank are only set
    for a team pulled from a league pool (NULL for a knockout winner) — they
    drive cross-pool seeding when the bucket becomes a knockout round
    (routers/buckets.py _seed_bucket_teams), so two teams that both came from
    Pool A don't end up paired against each other in Round 1.

    pushed_round_id is NULL while the team is just sitting in the bucket
    ("pulled") and set once create-round has placed it into an actual round
    ("pushed") — SET NULL again automatically if that round is deleted, and
    explicitly by the match cancel/delete endpoints if just that team's
    knockout match is cancelled or removed (routers/matches.py
    _free_pushed_bucket_entries), freeing the team for a future create-round
    call from the same bucket."""
    __tablename__ = "bucket_teams"
    bucket_id = Column(Integer, ForeignKey("buckets.id", ondelete="CASCADE"), primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True)
    source_pool_id = Column(Integer, ForeignKey("pools.id", ondelete="SET NULL"))
    seed_rank = Column(Integer)
    pushed_round_id = Column(Integer, ForeignKey("rounds.id", ondelete="SET NULL"))

    team = relationship("Team")
    source_pool = relationship("Pool")
    pushed_round = relationship("Round", foreign_keys=[pushed_round_id])


pool_teams = Table(
    "pool_teams",
    Base.metadata,
    Column("pool_id", Integer, ForeignKey("pools.id", ondelete="CASCADE"), primary_key=True),
    Column("team_id", Integer, ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True),
)


class Pool(TimestampMixin, Base):
    """A league/round-robin group within a Round — the alternative to a
    knockout Round's matches being wired via source_match_a/b_id. A Round can
    freely mix: some rounds are pool-stage rounds (this), others are
    knockout rounds (Match.source_match_a/b_id) — nothing here assumes a
    tournament is all-one-format.

    status: "draft" (teams still being assigned/adjusted, no matches yet) or
    "finalized" (round-robin fixtures generated — see routers/pools.py)."""
    __tablename__ = "pools"
    id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False)
    round_id = Column(Integer, ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(80), nullable=False)
    status = Column(String(20), nullable=False, default="draft")
    # Set once an organizer directly resolves a standings tie for this pool's
    # qualifying spot (routers/pools.py resolve_pool_tiebreak) instead of
    # picking tie_candidates through the Bucket flow — the final qualifier
    # team ids, in rank order (index 0 = winner). Overrides
    # routers/matches.py _compute_advancing_teams's own tie detection for
    # this pool once set. NULL means no override — the normal standings-based
    # computation (and its tie detection) applies.
    manual_qualifier_ids = Column(JSON)

    tournament = relationship("Tournament")
    round = relationship("Round", back_populates="pools")
    teams = relationship("Team", secondary=pool_teams, backref="pools")
    matches = relationship("Match", back_populates="pool", foreign_keys="Match.pool_id")


match_staff_assignments = Table(
    "match_staff_assignments",
    Base.metadata,
    Column("match_id", Integer, ForeignKey("matches.id", ondelete="CASCADE"), primary_key=True),
    Column("organizer_user_id", Integer, ForeignKey("organizer_users.id", ondelete="CASCADE"), primary_key=True),
)


class Match(TimestampMixin, Base):
    """A single fixture between two Teams. Either team slot can start out empty
    (source_match_a/b_id set instead) when the bracket is drawn ahead of earlier
    rounds finishing — see resolve_next_match() in routers/matches.py, which
    fills that slot in once the source match completes.

    match_type distinguishes a knockout-bracket match from a league/pool
    round-robin match (pool_id set); both share every other field and the
    exact same lifecycle/live-scoring pipeline — a pool match starting,
    scoring, and completing works identically to a knockout match."""
    __tablename__ = "matches"
    id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False)
    round_id = Column(Integer, ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False)
    match_type = Column(String(20), nullable=False, default="KNOCKOUT")  # schemas.MATCH_TYPES
    pool_id = Column(Integer, ForeignKey("pools.id", ondelete="CASCADE"))  # set only for LEAGUE matches

    team_a_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"))
    team_b_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"))
    # If a slot isn't filled by a known team yet, it's fed by another match's winner.
    source_match_a_id = Column(Integer, ForeignKey("matches.id", ondelete="SET NULL"))
    source_match_b_id = Column(Integer, ForeignKey("matches.id", ondelete="SET NULL"))
    # ...or, for the Knockout round built straight off a League round's pools
    # (whole-season League generation), by a specific pool's qualifier at a
    # specific rank (1 = winner, 2 = runner-up) — the pool-stage equivalent of
    # source_match_a/b_id, filled in by routers/matches.py
    # _propagate_pool_qualifiers once that pool's standings are final.
    source_pool_a_id = Column(Integer, ForeignKey("pools.id", ondelete="SET NULL"))
    source_pool_a_rank = Column(Integer)
    source_pool_b_id = Column(Integer, ForeignKey("pools.id", ondelete="SET NULL"))
    source_pool_b_rank = Column(Integer)

    venue_id = Column(Integer, ForeignKey("venues.id", ondelete="SET NULL"))
    scheduled_at = Column(DateTime(timezone=True))
    # End of the scheduled time slot — only meaningful together with
    # scheduled_at, used to detect overlapping bookings on the same mat (see
    # PUT /api/matches/{id}/mat's overlap check below).
    scheduled_end_at = Column(DateTime(timezone=True))
    # Which physical mat/ground this match is on right now — a lightweight,
    # organizer-managed registry (see Mat below), deliberately separate from
    # venue_id/the Venue registry (that's the whole-event location; this is a
    # fast-changing, per-match operational detail). Settable regardless of
    # status via PUT /api/matches/{id}/mat — see routers/matches.py.
    mat_id = Column(Integer, ForeignKey("mats.id", ondelete="SET NULL"))

    status = Column(String(20), nullable=False, default="SCHEDULED")  # schemas.MATCH_STATUSES
    team_a_score = Column(Integer, nullable=False, default=0)
    team_b_score = Column(Integer, nullable=False, default=0)
    winner_team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"))
    # Set when this match was decided by forfeit rather than played out — the
    # team that forfeited (the *other* team is winner_team_id, same as any
    # other completed match). Purely informational: status stays COMPLETED so
    # every existing "is this match decided" check keeps working unchanged.
    forfeited_team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"))

    started_at = Column(DateTime(timezone=True))
    ended_at = Column(DateTime(timezone=True))
    notes = Column(Text)

    tournament = relationship("Tournament")
    round = relationship("Round", back_populates="matches", foreign_keys=[round_id])
    pool = relationship("Pool", back_populates="matches", foreign_keys=[pool_id])
    team_a = relationship("Team", foreign_keys=[team_a_id])
    team_b = relationship("Team", foreign_keys=[team_b_id])
    winner_team = relationship("Team", foreign_keys=[winner_team_id])
    forfeited_team = relationship("Team", foreign_keys=[forfeited_team_id])
    venue = relationship("Venue")
    mat = relationship("Mat")
    source_match_a = relationship("Match", remote_side=[id], foreign_keys=[source_match_a_id])
    source_match_b = relationship("Match", remote_side=[id], foreign_keys=[source_match_b_id])
    source_pool_a = relationship("Pool", foreign_keys=[source_pool_a_id])
    source_pool_b = relationship("Pool", foreign_keys=[source_pool_b_id])
    events = relationship(
        "MatchEvent", back_populates="match", cascade="all, delete-orphan", order_by="MatchEvent.id"
    )
    assigned_users = relationship("OrganizerUser", secondary=match_staff_assignments, back_populates="assigned_matches")


class MatchEvent(TimestampMixin, Base):
    """Append-only score/status history for a Match — the source of truth behind
    the live score. `component` is a free-text hook (default "point") so a future
    sport with sets/innings/quarters can tag events without a schema change; the
    running totals still live on Match.team_a/b_score for fast reads."""
    __tablename__ = "match_events"
    id = Column(Integer, primary_key=True)
    match_id = Column(Integer, ForeignKey("matches.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String(20), nullable=False)  # schemas.MATCH_EVENT_TYPES
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"))  # null for match-level events
    component = Column(String(40))  # e.g. "point", "goal", "set" — null for non-score events
    delta = Column(Integer)  # signed change applied, e.g. +1, +2, -1 (correction)
    team_a_score = Column(Integer, nullable=False)  # running total snapshot, for timeline/replay
    team_b_score = Column(Integer, nullable=False)
    created_by_id = Column(Integer, ForeignKey("organizer_users.id", ondelete="SET NULL"))

    match = relationship("Match", back_populates="events")
    team = relationship("Team")
    created_by = relationship("OrganizerUser")


class Report(TimestampMixin, Base):
    """A generated, persisted per-round match report (routers/reports.py) — the
    organizer's explicit "Generate Report" action snapshots that round's data
    into file_data right now, rather than this being a live/recomputed
    download. round_id is SET NULL (not CASCADE) if the round is later
    deleted, specifically so the report survives that and keeps meaning what
    it meant when generated — round_name/round_sequence/format are captured
    here at generation time for exactly that reason; round_id is None is the
    whole "belongs to a deleted round" signal, nothing else needed for it.
    The full-tournament report (all rounds, one workbook) is a separate, live,
    unpersisted download — it isn't tied to one round the way this is, so
    there's nothing here to snapshot for it."""
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True)
    tournament_id = Column(Integer, ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False)
    round_id = Column(Integer, ForeignKey("rounds.id", ondelete="SET NULL"))
    round_name = Column(String(120), nullable=False)
    round_sequence = Column(Integer, nullable=False)
    format = Column(String(20), nullable=False)  # schemas.ROUND_FORMATS, snapshotted
    file_data = Column(LargeBinary, nullable=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    tournament = relationship("Tournament")
    round = relationship("Round")
