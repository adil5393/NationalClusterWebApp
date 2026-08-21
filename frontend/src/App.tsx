import { Routes, Route } from "react-router-dom";
import { PublicLayout } from "@/components/public/PublicLayout";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { ComingSoon } from "@/components/admin/ComingSoon";
import { PlaceholderPage } from "@/pages/public/PlaceholderPage";

import Home from "@/pages/public/Home";
import PublicTeams from "@/pages/public/Teams";
import TeamPortal from "@/pages/public/TeamPortal";
import PublicAnnouncements from "@/pages/public/Announcements";

import Dashboard from "@/pages/admin/Dashboard";
import AdminTeams from "@/pages/admin/Teams";
import BuildingsRooms from "@/pages/admin/BuildingsRooms";
import Accommodation from "@/pages/admin/Accommodation";
import Knowledge from "@/pages/admin/Knowledge";
import Procurement from "@/pages/admin/Procurement";
import AdminAnnouncements from "@/pages/admin/Announcements";

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/teams" element={<PublicTeams />} />
        <Route path="/teams/:id" element={<TeamPortal />} />
        <Route path="/announcements" element={<PublicAnnouncements />} />
        <Route path="/about" element={<PlaceholderPage title="About the Event" section="About" />} />
        <Route path="/schedule" element={<PlaceholderPage title="Schedule" section="Schedule" />} />
        <Route path="/venues" element={<PlaceholderPage title="Venues" section="Venues" />} />
        <Route path="/accommodation" element={<PlaceholderPage title="Accommodation" section="Accommodation" />} />
        <Route path="/food" element={<PlaceholderPage title="Food & Dining" section="Food" />} />
        <Route path="/transport" element={<PlaceholderPage title="Transport" section="Transport" />} />
        <Route path="/campus" element={<PlaceholderPage title="Campus Map" section="Campus" />} />
        <Route path="/contacts" element={<PlaceholderPage title="Important Contacts" section="Contacts" />} />
        <Route path="/faq" element={<PlaceholderPage title="Frequently Asked Questions" section="FAQ" />} />
      </Route>

      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<Dashboard />} />
        <Route path="/admin/teams" element={<AdminTeams />} />
        <Route path="/admin/buildings" element={<BuildingsRooms />} />
        <Route path="/admin/knowledge" element={<Knowledge />} />
        <Route path="/admin/procurement" element={<Procurement />} />
        <Route path="/admin/announcements" element={<AdminAnnouncements />} />
        <Route path="/admin/participants" element={<ComingSoon title="Participants" />} />
        <Route path="/admin/accommodation" element={<Accommodation />} />
        <Route path="/admin/food" element={<ComingSoon title="Food Planning" />} />
        <Route path="/admin/transport" element={<ComingSoon title="Transport" />} />
        <Route path="/admin/venues" element={<ComingSoon title="Venues" />} />
        <Route path="/admin/schedule" element={<ComingSoon title="Schedule Management" />} />
        <Route path="/admin/tasks" element={<ComingSoon title="Tasks" />} />
        <Route path="/admin/documents" element={<ComingSoon title="Documents" />} />
        <Route path="/admin/contacts" element={<ComingSoon title="Contacts" />} />
        <Route path="/admin/settings" element={<ComingSoon title="Settings" />} />
      </Route>
    </Routes>
  );
}
