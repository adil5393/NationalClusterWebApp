"""Thin client for CBSE's public sports results portal
(academic.cbseit.in/sports/ViewResult/ViewResult).

The site drives its search form with a handful of small AJAX endpoints that
populate the Games / Age Group / Cluster-Zone / Events dropdowns, and posts
the actual search as multipart/form-data with an ASP.NET antiforgery token
that's tied to the session cookie from the very first GET. This module
reproduces just that handshake (GET the form once for a cookie + token,
then POST search.* fields) and parses the returned #myTable rows.

No personal data (student name, DOB, father's name) is written to disk by
this module — callers decide what to keep; see scrape_cbse_cluster_gold.py
for the convention this project follows (keep affiliation no. + school name
only, discard the rest after computing who won).
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://academic.cbseit.in/sports"
VIEW_RESULT_URL = f"{BASE_URL}/ViewResult/ViewResult"
USER_AGENT = "Mozilla/5.0 (compatible; NationalClusterWebApp/1.0)"


@dataclass
class ResultRow:
    serial_no: str
    affiliation_no: str
    school_name: str
    registration_no: str
    student_name: str
    father_name: str
    dob: str
    gender: str
    game: str
    sub_game: str
    level: str
    cluster_zone_name: str
    age_group: str
    medal: str


class CBSESportsClient:
    """Reusable session against the CBSE sports ViewResult form."""

    def __init__(self, request_delay: float = 0.5):
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.request_delay = request_delay
        self._token: str | None = None

    def _token_and_page(self) -> str:
        if self._token is None:
            resp = self.session.get(VIEW_RESULT_URL, timeout=30)
            resp.raise_for_status()
            match = re.search(
                r'name="__RequestVerificationToken"[^>]*value="([^"]+)"', resp.text
            )
            if not match:
                raise RuntimeError("Could not find __RequestVerificationToken on the ViewResult page")
            self._token = match.group(1)
        return self._token

    def _get_json(self, path: str, params: dict) -> list[dict]:
        self._token_and_page()  # ensures session cookie is set first
        resp = self.session.get(f"{BASE_URL}/ViewResult/{path}", params=params, timeout=30)
        resp.raise_for_status()
        time.sleep(self.request_delay)
        return resp.json()

    def get_games(self) -> list[dict]:
        return self._get_json("GetGameName", {})

    def get_age_groups(self, game_id: str, year: int) -> list[dict]:
        return self._get_json("GetAgeGroup", {"games": game_id, "year": year})

    def get_cluster_zones(self, level: str) -> list[dict]:
        return self._get_json("GetClusterZone", {"nameoflevel": level})

    def get_events(self, game_id: str, gender: str, age_group_label: str, year: int) -> list[dict]:
        return self._get_json(
            "GetEvents",
            {"game_id": game_id, "gender": gender, "agegroup": age_group_label, "year": year},
        )

    def search(
        self,
        *,
        year: int,
        level: str,
        cluster_zone: str,
        gender: str,
        game_id: str,
        age_group_value: str,
        events_value: str,
    ) -> list[ResultRow]:
        """Runs one ViewResult search and returns its result-table rows."""
        token = self._token_and_page()
        resp = self.session.post(
            VIEW_RESULT_URL,
            data={
                "search.Year": year,
                "search.nameoflevel": level,
                "search.clusterzone": cluster_zone,
                "search.Gender": gender,
                "search.Games": game_id,
                "search.Agegroup": age_group_value,
                "search.Events": events_value,
                "Agegroup": "",
                "__RequestVerificationToken": token,
            },
            timeout=30,
        )
        resp.raise_for_status()
        time.sleep(self.request_delay)
        return self._parse_table(resp.text)

    @staticmethod
    def _parse_table(html: str) -> list[ResultRow]:
        soup = BeautifulSoup(html, "html.parser")
        table = soup.find("table", id="myTable")
        if table is None:
            return []
        body = table.find("tbody")
        if body is None:
            return []
        rows = []
        for tr in body.find_all("tr"):
            cells = [td.get_text(strip=True) for td in tr.find_all("td")]
            if len(cells) != 14:
                continue
            rows.append(ResultRow(*cells))
        return rows
