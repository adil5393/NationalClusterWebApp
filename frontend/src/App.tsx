import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { PublicLayout } from "@/components/public/PublicLayout";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { ComingSoon } from "@/components/admin/ComingSoon";
import { Spinner } from "@/components/ui/feedback";

// Public route lazy imports
const Home = lazy(() => import("@/pages/public/Home"));
const PublicTeams = lazy(() => import("@/pages/public/Teams"));
const TeamPortal = lazy(() => import("@/pages/public/TeamPortal"));
const PublicAnnouncements = lazy(() => import("@/pages/public/Announcements"));
const PublicAbout = lazy(() => import("@/pages/public/About"));
const PublicSchedule = lazy(() => import("@/pages/public/Schedule"));
const Campus = lazy(() => import("@/pages/public/Campus"));
const Live = lazy(() => import("@/pages/public/Live"));
const Pool = lazy(() => import("@/pages/public/Pool"));
const PlaceholderPage = lazy(() =>
  import("@/pages/public/PlaceholderPage").then((m) => ({ default: m.PlaceholderPage })),
);

// Admin route lazy imports
const Dashboard = lazy(() => import("@/pages/admin/Dashboard"));
const AdminTeams = lazy(() => import("@/pages/admin/Teams"));
const Participants = lazy(() => import("@/pages/admin/Participants"));
const BuildingsRooms = lazy(() => import("@/pages/admin/BuildingsRooms"));
const Accommodation = lazy(() => import("@/pages/admin/Accommodation"));
const Transport = lazy(() => import("@/pages/admin/Transport"));
const Schedule = lazy(() => import("@/pages/admin/Schedule"));
const Venues = lazy(() => import("@/pages/admin/Venues"));
const RoomMap = lazy(() => import("@/pages/admin/RoomMap"));
const Knowledge = lazy(() => import("@/pages/admin/Knowledge"));
const Procurement = lazy(() => import("@/pages/admin/Procurement"));
const AdminAnnouncements = lazy(() => import("@/pages/admin/Announcements"));
const AdminFaq = lazy(() => import("@/pages/admin/Faq"));
const Staff = lazy(() => import("@/pages/admin/Staff"));
const Matches = lazy(() => import("@/pages/admin/Matches"));
const MatGroundAssignment = lazy(() => import("@/pages/admin/MatGroundAssignment"));
const Reports = lazy(() => import("@/pages/admin/Reports"));
const Tasks = lazy(() => import("@/pages/admin/Tasks"));
const Accounts = lazy(() => import("@/pages/admin/Accounts"));
const Login = lazy(() => import("@/pages/admin/Login"));

// The Android app (Capacitor) is a dedicated Organizer Portal build — reusing
// this same web bundle, but it should never land a user on the public
// marketing site. Every in-app link only ever points at /admin/*, so this one
// redirect on the entry route is enough; the public routes stay in the bundle
// (still served fine to real browsers) but are simply unreachable in the app.
const isNativeApp = Capacitor.isNativePlatform();

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <Spinner label="Loading..." />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route
            path="/"
            element={isNativeApp ? <Navigate to="/admin/login" replace /> : <Home />}
          />
          <Route path="/teams" element={<PublicTeams />} />
          <Route path="/teams/:id" element={<TeamPortal />} />
          <Route path="/announcements" element={<PublicAnnouncements />} />
          <Route path="/about" element={<PublicAbout />} />
          <Route path="/schedule" element={<PublicSchedule />} />
          <Route
            path="/venues"
            element={<PlaceholderPage title="Venues" section="Venues" />}
          />
          <Route
            path="/accommodation"
            element={<PlaceholderPage title="Accommodation" section="Accommodation" />}
          />
          <Route
            path="/food"
            element={<PlaceholderPage title="Food & Dining" section="Food" />}
          />
          <Route
            path="/transport"
            element={<PlaceholderPage title="Transport" section="Transport" />}
          />
          <Route path="/campus" element={<Campus />} />
          <Route path="/live" element={<Live />} />
          <Route path="/live/pools/:poolId" element={<Pool />} />
          <Route
            path="/contacts"
            element={<PlaceholderPage title="Important Contacts" section="Contacts" />}
          />
          <Route
            path="/faq"
            element={<PlaceholderPage title="Frequently Asked Questions" section="FAQ" />}
          />
        </Route>

        <Route path="/admin/login" element={<Login />} />

        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Dashboard />} />
          <Route path="/admin/teams" element={<AdminTeams />} />
          <Route path="/admin/buildings" element={<BuildingsRooms />} />
          <Route path="/admin/staff" element={<Staff />} />
          <Route path="/admin/knowledge" element={<Knowledge />} />
          <Route path="/admin/procurement" element={<Procurement />} />
          <Route path="/admin/announcements" element={<AdminAnnouncements />} />
          <Route path="/admin/faq" element={<AdminFaq />} />
          <Route path="/admin/participants" element={<Participants />} />
          <Route path="/admin/accommodation" element={<Accommodation />} />
          <Route path="/admin/room-map" element={<RoomMap />} />
          <Route path="/admin/food" element={<ComingSoon title="Food Planning" />} />
          <Route path="/admin/transport" element={<Transport />} />
          <Route path="/admin/venues" element={<Venues />} />
          <Route path="/admin/schedule" element={<Schedule />} />
          <Route path="/admin/matches" element={<Matches />} />
          <Route path="/admin/mat-ground" element={<MatGroundAssignment />} />
          <Route path="/admin/reports" element={<Reports />} />
          <Route path="/admin/tasks" element={<Tasks />} />
          <Route path="/admin/documents" element={<ComingSoon title="Documents" />} />
          <Route path="/admin/contacts" element={<ComingSoon title="Contacts" />} />
          <Route path="/admin/settings" element={<ComingSoon title="Settings" />} />
          <Route path="/admin/accounts" element={<Accounts />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
